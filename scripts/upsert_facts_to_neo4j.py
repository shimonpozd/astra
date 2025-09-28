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
INPUT_FILE = os.getenv("INPUT_JSONL", "facts_for_neo4j.jsonl")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 500))

# ----------------- Normalization (Compatibility Layer) -----------------
PERSON_SET = {"Шимон", "Казах"}

def normalize_record(raw: dict) -> Optional[dict]:
    """
    Validates, sanitizes, and prepares a record for Neo4j upsert.
    Returns a dictionary object ready to be sent as a row.
    """
    if not isinstance(raw, dict):
        return None

    rid = raw.get("fact_id")
    if not rid:
        return None

    payload = raw.copy()

    # --- Data Sanitization ---
    # Ensure timestamp is a valid integer, otherwise set to None.
    ts = payload.get("timestamp")
    if not isinstance(ts, int):
        try:
            # Handle potential float or string representations
            payload["timestamp"] = int(float(ts))
        except (ValueError, TypeError, AttributeError):
            # If conversion fails, set to None so Cypher can handle it as null
            payload["timestamp"] = None
            
    # Ensure date_int is a valid integer
    di = payload.get("date_int")
    if not isinstance(di, int):
        try:
            payload["date_int"] = int(float(di))
        except (ValueError, TypeError, AttributeError):
            payload["date_int"] = None

    # Fallback to calculate date_int from timestamp if it's missing
    if payload.get("date_int") is None and payload.get("timestamp") is not None:
        try:
            dt = datetime.fromtimestamp(payload["timestamp"])
            payload["date_int"] = int(dt.strftime('%Y%m%d'))
        except Exception:
            # If timestamp is out of range or invalid, this might fail
            pass

    return {"id": rid, "payload": payload}

# ----------------- Cypher Queries -----------------
SETUP_CONSTRAINTS_QUERIES = [
    "CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.fact_id IS UNIQUE;",
    "CREATE CONSTRAINT topic_slug IF NOT EXISTS FOR (t:Topic) REQUIRE t.slug IS UNIQUE;",
    "CREATE CONSTRAINT entity_slug IF NOT EXISTS FOR (e:Entity) REQUIRE e.slug IS UNIQUE;",
    "CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE;",
    "CREATE CONSTRAINT msg_id IF NOT EXISTS FOR (m:Message) REQUIRE m.message_id IS UNIQUE;"
]

SETUP_INDEXES_QUERIES = [
    "CREATE INDEX fact_date IF NOT EXISTS FOR (f:Fact) ON (f.date_int);",
    "CREATE INDEX fact_ts IF NOT EXISTS FOR (f:Fact) ON (f.timestamp);"
]

UPSERT_BATCH_QUERY = """
UNWIND $rows AS row
WITH row.id AS id, row.payload AS p

// Merge the Fact node first
MERGE (f:Fact {fact_id: id})
  ON CREATE SET
    f.text        = p.text,
    f.fact_type   = p.fact_type,
    f.timestamp   = CASE WHEN p.timestamp IS NOT NULL THEN datetime({epochSeconds: toInteger(p.timestamp)}) ELSE null END,
    f.date_int    = toInteger(p.date_int),
    f.confidence  = toFloat(p.confidence),
    f.session_id  = p.session_id,
    f.lang        = p.lang,
    f.created_at  = datetime()
  ON MATCH SET
    f.text        = p.text,
    f.fact_type   = p.fact_type,
    f.timestamp   = CASE WHEN p.timestamp IS NOT NULL THEN datetime({epochSeconds: toInteger(p.timestamp)}) ELSE null END,
    f.date_int    = toInteger(p.date_int),
    f.confidence  = toFloat(p.confidence),
    f.session_id  = p.session_id,
    f.lang        = p.lang,
    f.updated_at  = datetime()

// Use FOREACH for list-based merges to prevent rows from being dropped

// Speaker
WITH f, p
WHERE p.speaker IS NOT NULL AND f.timestamp IS NOT NULL
MERGE (sp:Person {name: p.speaker})
MERGE (sp)-[:SPOKE {at: f.timestamp}]->(f)

// Participants
WITH f, p
FOREACH (part IN coalesce(p.participants,[]) |
    MERGE (pp:Person {name: part})
    MERGE (f)-[:INVOLVES]->(pp)
)

// Topics
WITH f, p
FOREACH (ts IN coalesce(p.topic_slugs,[]) |
    MERGE (t:Topic {slug: ts})
    MERGE (f)-[:MENTIONS]->(t)
)

// Entities
WITH f, p
FOREACH (es IN coalesce(p.entity_slugs, []) |
    MERGE (e:Entity {slug: es})
    MERGE (f)-[:MENTIONS]->(e)
)

// Messages
WITH f, p
FOREACH (mid IN coalesce(p.source_message_ids,[]) |
    MERGE (m:Message {message_id: mid})
    SET m.chat_id = p.session_id
    MERGE (f)-[:DERIVED_FROM]->(m)
)
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
        MATCH (p:Person)<-[:INVOLVES]-(f:Fact)-[:MENTIONS]->(t:Topic)
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
