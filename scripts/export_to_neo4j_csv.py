import os
import json
import csv
import logging
from tqdm import tqdm
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# ----------------- Logging Setup -----------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ----------------- Configuration -----------------
INPUT_FILE = "facts_output.jsonl"
OUTPUT_DIR = "neo4j_export"
PERSONS = ["Шимон", "Казах"]
PERSON_SET = set(PERSONS)

# ----------------- Normalization (Compatibility Layer) -----------------
def _to_date_int(ts: str) -> Optional[int]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z",""))
        return dt.year * 10000 + dt.month * 100 + dt.day
    except Exception:
        return None

def normalize_record(raw: dict) -> Optional[Tuple[str, dict]]:
    if not isinstance(raw, dict):
        return None

    if "payload" in raw and isinstance(raw["payload"], dict):
        rid = raw.get("id") or raw["payload"].get("original_id")
        payload = raw["payload"].copy()
    else:
        rid = raw.get("id") or raw.get("original_id")
        payload = {k: v for k, v in raw.items() if k not in ("id", "vector", "embedding", "embedding_model")}

        if "entities_flat" not in payload:
            payload["entities_flat"] = payload.get("entities", [])
        if "timestamp" not in payload:
            payload["timestamp"] = payload.get("timestamp_start") or payload.get("timestamp_end")
        if "date_int" not in payload:
            di = _to_date_int(payload.get("timestamp"))
            if di is not None:
                payload["date_int"] = di
        if isinstance(payload.get("entities_flat"), list):
            payload["entities_flat"] = [e for e in payload["entities_flat"] if e not in PERSON_SET]

    payload.setdefault("topics", [])
    payload.setdefault("participants", [])
    payload.setdefault("source_message_ids", [])
    payload.setdefault("confidence", 0.6)
    payload.setdefault("lang", "ru")

    if not rid:
        return None
    if not payload.get("text"):
        if payload.get("text_for_vector"):
            payload["text"] = payload["text_for_vector"]
        else:
            return None
    if not payload.get("timestamp"):
        return None

    return str(rid), payload

# CSV Headers
HEADERS = {
    "facts": [":ID(Fact)", "text", "fact_type", "timestamp:datetime", "date_int:int", "confidence:float", "lang", "chat_id", "session_id", "meta"],
    "persons": [":ID(Person)", "name"],
    "topics": [":ID(Topic)", "name"],
    "entities": [":ID(Entity)", "name"],
    "chats": [":ID(Chat)", "chat_id"],
    "messages": [":ID(Message)", "message_id", "timestamp:datetime"],
    "fact_said_by": [":START_ID(Fact)", ":END_ID(Person)", ":TYPE", "weight:float"],
    "fact_has_topic": [":START_ID(Fact)", ":END_ID(Topic)", ":TYPE"],
    "fact_refers_to_entity": [":START_ID(Fact)", ":END_ID(Entity)", ":TYPE"],
    "fact_in_chat": [":START_ID(Fact)", ":END_ID(Chat)", ":TYPE"],
    "fact_derived_from_message": [":START_ID(Fact)", ":END_ID(Message)", ":TYPE"],
    "person_participates_in_chat": [":START_ID(Person)", ":END_ID(Chat)", ":TYPE"],
}

INPUT_FILE = "facts_for_neo4j.jsonl"
OUTPUT_DIR = "neo4j_export"
PERSONS = ["Шимон", "Казах"]
PERSON_SET = set(PERSONS)

# ... (rest of the file is the same until main)

def main():
    logging.info("Starting export process for Neo4j bulk import.")

    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        logging.info(f"Created output directory: {OUTPUT_DIR}")

    seen_topics = set()
    seen_entities = set()
    seen_chats = set()
    seen_messages = set()
    seen_person_chat_participation = set()

    try:
        files = {name: open(os.path.join(OUTPUT_DIR, f"{name}.csv"), "w", newline="", encoding="utf-8") for name in HEADERS}
        writers = {name: csv.writer(files[name]) for name in files}

        for name, writer in writers.items():
            writer.writerow(HEADERS[name])

        for person_name in PERSONS:
            writers["persons"].writerow([person_name, person_name])

        try:
            total_lines = sum(1 for _ in open(INPUT_FILE, 'r', encoding='utf-8'))
        except FileNotFoundError:
            logging.error(f"Input file not found: {INPUT_FILE}")
            return

        with open(INPUT_FILE, "r", encoding="utf-8") as f:
            for line in tqdm(f, total=total_lines, desc="Processing facts"):
                try:
                    data = json.loads(line)
                    fact_id, payload = data["fact_id"], data

                    confidence = max(0.0, min(1.0, float(payload.get("confidence", 0.6))))
                    
                    meta_json = json.dumps(payload.get("meta", {}), ensure_ascii=False)
                    writers["facts"].writerow([
                        fact_id,
                        payload.get("text"),
                        payload.get("fact_type"),
                        payload.get("timestamp"),
                        payload.get("date_int"),
                        confidence,
                        payload.get("lang"),
                        payload.get("chat_id"),
                        payload.get("session_id"),
                        meta_json
                    ])

                    for topic_raw in payload.get("topics", []):
                        topic = topic_raw.strip().lower()
                        if topic and topic not in seen_topics:
                            writers["topics"].writerow([topic, topic])
                            seen_topics.add(topic)
                    
                    for entity_raw in payload.get("entities_flat", []):
                        entity = entity_raw.strip()
                        if entity and entity not in PERSON_SET and entity not in seen_entities:
                            writers["entities"].writerow([entity, entity])
                            seen_entities.add(entity)
                    
                    chat_id = payload.get("chat_id")
                    if chat_id and chat_id not in seen_chats:
                        writers["chats"].writerow([chat_id, chat_id])
                        seen_chats.add(chat_id)

                    for msg_id in payload.get("source_message_ids", []):
                        if msg_id and msg_id not in seen_messages:
                            writers["messages"].writerow([msg_id, msg_id, None])
                            seen_messages.add(msg_id)

                    speaker = payload.get("speaker")
                    if speaker:
                        if speaker not in PERSON_SET:
                            writers["persons"].writerow([speaker, speaker])
                            PERSON_SET.add(speaker)
                        writers["fact_said_by"].writerow([fact_id, speaker, "SAID_BY", confidence])

                    for topic_raw in payload.get("topics", []):
                        topic = topic_raw.strip().lower()
                        if topic:
                            writers["fact_has_topic"].writerow([fact_id, topic, "HAS_TOPIC"])
                    
                    for entity_raw in payload.get("entities_flat", []):
                        entity = entity_raw.strip()
                        if entity and entity not in PERSON_SET:
                            writers["fact_refers_to_entity"].writerow([fact_id, entity, "REFERS_TO"])

                    if chat_id:
                        writers["fact_in_chat"].writerow([fact_id, chat_id, "IN_CHAT"])

                    for msg_id in payload.get("source_message_ids", []):
                        if msg_id:
                            writers["fact_derived_from_message"].writerow([fact_id, msg_id, "DERIVED_FROM"])
                    
                    if chat_id:
                        for participant in payload.get("participants", []):
                            if participant and (participant, chat_id) not in seen_person_chat_participation:
                                writers["person_participates_in_chat"].writerow([participant, chat_id, "PARTICIPATES_IN"])
                                seen_person_chat_participation.add((participant, chat_id))

                except (json.JSONDecodeError, KeyError) as e:
                    logging.warning(f"Skipping line due to error: {e} - Line: {line.strip()}")
                    continue

    finally:
        for f_name in files:
            files[f_name].close()
        logging.info("Finished export process. CSV files are in the 'neo4j_export' directory.")