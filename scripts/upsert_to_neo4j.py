import os
import json
import logging
from neo4j import GraphDatabase
from dotenv import load_dotenv
from tqdm import tqdm
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# ----------------- Logging Setup -----------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ----------------- Configuration -----------------
load_dotenv(override=True)
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
INPUT_FILE = os.getenv("INPUT_JSONL", "facts_for_neo4j_migrated.jsonl")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 500))

# ----------------- Normalization (Compatibility Layer) -----------------
PERSON_SET = {"Шимон", "Казах"}

def _to_date_int(ts: str) -> Optional[int]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z",""))
        return dt.year * 10000 + dt.month * 100 + dt.day
    except Exception:
        return None

def normalize_record(raw: dict) -> Optional[dict]:
    """Returns a dictionary object ready to be sent as a row to Neo4j."""
    if not isinstance(raw, dict):
        return None

    if "payload" in raw and isinstance(raw["payload"], dict):
        rid = raw.get("id") or raw["payload"].get("original_id")
        payload = raw["payload"].copy()
    else:
        rid = raw.get("id") or raw.get("original_id")
        payload = {k: v for k, v in raw.items() if k not in ("id", "vector", "embedding", "embedding_model")}

    if not rid:
        return None

    # Fallback for entities_flat
    if "entities_flat" not in payload and "entities" in payload:
        payload["entities_flat"] = payload["entities"]

    # Fallback for date_int
    if "date_int" not in payload:
        for key in ("timestamp", "timestamp_start"):
            ts = payload.get(key)
            di = _to_date_int(ts) if ts else None
            if di:
                payload["date_int"] = di
                break

    return {"id": rid, "payload": payload}

# ----------------- Cypher Queries -----------------
SETUP_CONSTRAINTS_QUERIES = [
    "CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.id IS UNIQUE;",
    "CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE;",
    "CREATE CONSTRAINT topic_label IF NOT EXISTS FOR (t:Topic) REQUIRE t.label IS UNIQUE;",
    "CREATE CONSTRAINT entity_label IF NOT EXISTS FOR (e:Entity) REQUIRE e.label IS UNIQUE;",
    "CREATE CONSTRAINT msg_id IF NOT EXISTS FOR (m:Message) REQUIRE m.message_id IS UNIQUE;"
]

SETUP_INDEXES_QUERIES = [
    "CREATE INDEX fact_date IF NOT EXISTS FOR (f:Fact) ON (f.date_int);",
    "CREATE INDEX fact_ts IF NOT EXISTS FOR (f:Fact) ON (f.timestamp);"
]

UPSERT_BATCH_QUERY = """
UNWIND $rows AS row
WITH row.id AS id, row.payload AS p

MERGE (f:Fact {id: id})
  ON CREATE SET
    f.original_id = p.original_id,
    f.text        = p.text,
    f.fact_type   = p.fact_type,
    f.timestamp   = CASE WHEN p.timestamp IS NOT NULL THEN datetime(p.timestamp) ELSE null END,
    f.timestamp_start = CASE WHEN p.timestamp_start IS NOT NULL THEN datetime(p.timestamp_start) ELSE null END,
    f.timestamp_end   = CASE WHEN p.timestamp_end IS NOT NULL THEN datetime(p.timestamp_end) ELSE null END,
    f.date_int    = toInteger(p.date_int),
    f.confidence  = toFloat(p.confidence),
    f.chat_id     = p.chat_id,
    f.session_id  = p.session_id,
    f.lang        = p.lang,
    f.created_at  = datetime(),
    f.updated_at  = datetime()
  ON MATCH SET
    f.text        = p.text,
    f.fact_type   = p.fact_type,
    f.timestamp   = CASE WHEN p.timestamp IS NOT NULL THEN datetime(p.timestamp) ELSE null END,
    f.timestamp_start = CASE WHEN p.timestamp_start IS NOT NULL THEN datetime(p.timestamp_start) ELSE null END,
    f.timestamp_end   = CASE WHEN p.timestamp_end IS NOT NULL THEN datetime(p.timestamp_end) ELSE null END,
    f.date_int    = toInteger(p.date_int),
    f.confidence  = toFloat(p.confidence),
    f.chat_id     = p.chat_id,
    f.session_id  = p.session_id,
    f.lang        = p.lang,
    f.updated_at  = datetime()

// Speaker
WITH f, p
WHERE p.speaker IS NOT NULL
MERGE (sp:Person {name: p.speaker})
MERGE (sp)-[:SPOKE {at: coalesce(f.timestamp, f.timestamp_start)}]->(f)

// Participants
WITH f, p
UNWIND coalesce(p.participants,[]) AS part
MERGE (pp:Person {name: part})
MERGE (f)-[:INVOLVES]->(pp)

// Topics
WITH f, p
UNWIND coalesce(p.topics,[]) AS tl
MERGE (t:Topic {label: tl})
MERGE (f)-[:ABOUT_TOPIC]->(t)

// Entities
WITH f, p
UNWIND [el IN coalesce(p.entities_flat, p.entities, []) WHERE NOT el IN $persons_set] AS el
MERGE (e:Entity {label: el})
MERGE (f)-[:MENTIONS]->(e)

// Messages
WITH f, p
UNWIND coalesce(p.source_message_ids,[]) AS mid
MERGE (m:Message {message_id: mid})
SET m.chat_id = p.chat_id
MERGE (f)-[:DERIVED_FROM]->(m)
"""

POST_PROCESS_QUERIES = {
    "knows": """
        MATCH (a:Person)<-[:INVOLVES]-(f:Fact)-[:INVOLVES]->(b:Person)
        WHERE a <> b
        WITH a, b, count(DISTINCT f) AS cnt, min(f.timestamp) AS since
        MERGE (a)-[k:KNOWS]->(b)
          ON CREATE SET k.since = since, k.weight = cnt
          ON MATCH SET  k.weight = cnt, k.updated_at = datetime();
        """,
    "last_seen": """
        MATCH (p:Person)<-[:INVOLVES]-(f:Fact)
        WITH p, max(f.timestamp) AS last_seen, count(f) AS facts
        SET p.last_seen = last_seen, p.facts_count = facts;
        """,
    "interest_in": """
        MATCH (p:Person)<-[:INVOLVES]-(f:Fact)-[:ABOUT_TOPIC]->(t:Topic)
        WITH p, t, count(f) AS c
        MERGE (p)-[r:INTEREST_IN]->(t)
        ON CREATE SET r.weight=c
        ON MATCH  SET r.weight=c;
        """,
    "alias_stub": """
        MERGE (stub:Topic {label:"__alias_stub__"})
        MERGE (stub)-[:ALIAS_OF]->(stub);
        """
}

QUALITY_CHECK_QUERIES = {
    "fact_count": "MATCH (f:Fact) RETURN count(f) AS count;",
    "person_count": "MATCH (p:Person) RETURN count(p) AS count;",
    "knows_rel": "MATCH (:Person)-[k:KNOWS]-(:Person) RETURN count(k) as count;"
}

class Neo4jUpserter:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def setup_schema(self):
        logging.info("Setting up database schema (constraints and indexes)...")
        with self.driver.session() as session:
            for query in SETUP_CONSTRAINTS_QUERIES:
                session.run(query)
            for query in SETUP_INDEXES_QUERIES:
                session.run(query)
        logging.info("Schema setup complete.")

    def run_upsert(self):
        logging.info(f"Starting upsert from {INPUT_FILE}...")
        batch = []
        processed_count = 0
        skipped_count = 0

        try:
            total_lines = sum(1 for _ in open(INPUT_FILE, 'r', encoding='utf-8'))
        except FileNotFoundError:
            logging.error(f"Input file not found: {INPUT_FILE}")
            return

        with open(INPUT_FILE, "r", encoding="utf-8") as f:
            for line in tqdm(f, total=total_lines, desc="Upserting facts"):
                try:
                    data = json.loads(line)
                    norm_row = normalize_record(data)
                    if not norm_row:
                        skipped_count += 1
                        continue
                    
                    batch.append(norm_row)
                    
                    if len(batch) >= BATCH_SIZE:
                        self.driver.session().execute_write(self._upsert_batch, batch)
                        processed_count += len(batch)
                        batch.clear()

                except json.JSONDecodeError:
                    skipped_count += 1
                    continue
            
            if batch: # Process the final batch
                self.driver.session().execute_write(self._upsert_batch, batch)
                processed_count += len(batch)

        logging.info(f"Upsert finished. Processed: {processed_count}, Skipped: {skipped_count}")

    @staticmethod
    def _upsert_batch(tx, batch):
        tx.run(UPSERT_BATCH_QUERY, rows=batch, persons_set=list(PERSON_SET))

    def run_post_processing(self):
        logging.info("Running post-processing queries...")
        with self.driver.session() as session:
            for name, query in POST_PROCESS_QUERIES.items():
                logging.info(f"  - Running: {name}")
                session.run(query)
        logging.info("Post-processing complete.")

    def run_quality_checks(self):
        logging.info("Running quality checks...")
        with self.driver.session() as session:
            for name, query in QUALITY_CHECK_QUERIES.items():
                result = session.run(query)
                logging.info(f"  - Check '{name}':")
                for record in result:
                    logging.info(f"    {record.data()}")
        logging.info("Quality checks complete.")

def main():
    logging.info("Starting Neo4j post-processing script.")
    try:
        upserter = Neo4jUpserter(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)
        upserter.setup_schema()
        upserter.run_upsert()
        upserter.run_post_processing()
        upserter.run_quality_checks()
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}", exc_info=True)
    finally:
        if 'upserter' in locals() and upserter.driver:
            upserter.close()
        logging.info("Script finished.")

if __name__ == "__main__":
    main()