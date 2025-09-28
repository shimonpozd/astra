import json
import hashlib
import re
from datetime import datetime
import os
from tqdm import tqdm

def generate_slug(name: str) -> str:
    """Generates a slug from a string."""
    return name.lower().replace(' ', '-').strip()

def normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().lower()

def migrate_record(old_record: dict) -> (dict, dict):
    """
    Takes an old record from the jsonl file and converts it to the new format
    for both Qdrant and Neo4j.
    """
    payload = old_record.get("payload", old_record)

    # --- Extract old data ---
    text = payload.get("text", "")
    speaker = payload.get("speaker", "unknown")
    session_id = payload.get("session_id", payload.get("chat_id", "unknown_chat")),
    
    # Timestamp conversion
    ts_iso = payload.get("timestamp", "1970-01-01T00:00:00")
    ts_dt = datetime.fromisoformat(ts_iso.replace("Z", ""))
    ts_unix = int(ts_dt.timestamp())
    date_int = int(ts_dt.strftime('%Y%m%d'))

    source_ids = payload.get("source_message_ids", [])
    
    # --- Generate new data ---
    # ID generation
    text_for_vector = payload.get("text_for_vector", text)
    min_source_id = min(source_ids) if source_ids else "0"
    id_basis = f"{normalize_text(text_for_vector)}|{session_id}|{speaker}|{min_source_id}|{date_int}"
    fact_id = hashlib.sha256(id_basis.encode('utf-8')).hexdigest()

    # Slug generation
    topics_raw = payload.get("topics", [])
    topic_slugs = sorted(list({generate_slug(t) for t in topics_raw}))

    entity_names = payload.get("entities_flat", [])
    entity_slugs = sorted(list({generate_slug(e) for e in entity_names}))

    # --- Assemble new records ---
    qdrant_payload = {
        "text": text,
        "fact_type": payload.get("fact_type", "generic"),
        "confidence": payload.get("confidence", 0.7),
        "timestamp": ts_unix,
        "date_int": date_int,
        "session_id": session_id,
        "speaker": speaker,
        "participants": payload.get("participants", []),
        "topic_slugs": topic_slugs,
        "entity_slugs": entity_slugs,
        "source_message_ids": source_ids,
        "lang": payload.get("lang", "ru"),
        "meta": payload.get("meta", {"platform": "WhatsApp", "version": 2})
    }
    qdrant_record = {"id": fact_id, "payload": qdrant_payload}

    neo4j_record = {
        "fact_id": fact_id,
        "text": text,
        "fact_type": payload.get("fact_type", "generic"),
        "confidence": payload.get("confidence", 0.7),
        "timestamp": ts_unix,
        "speaker": speaker,
        "participants": payload.get("participants", []),
        "topic_slugs": topic_slugs,
        "entity_slugs": entity_slugs,
        "source_message_ids": source_ids
    }
    
    return qdrant_record, neo4j_record

def main():
    old_qdrant_file = "facts_for_qdrant.jsonl"
    new_qdrant_file = "facts_for_qdrant_migrated.jsonl"
    new_neo4j_file = "facts_for_neo4j_migrated.jsonl"

    if not os.path.exists(old_qdrant_file):
        print(f"Error: Input file not found: {old_qdrant_file}")
        return

    print(f"Starting migration of {old_qdrant_file}...")

    # Count lines for tqdm progress bar
    with open(old_qdrant_file, 'r', encoding='utf-8') as f:
        total_lines = sum(1 for _ in f)

    with open(old_qdrant_file, "r", encoding="utf-8") as f_in, \
         open(new_qdrant_file, "w", encoding="utf-8") as f_q_out, \
         open(new_neo4j_file, "w", encoding="utf-8") as f_n_out:
        
        for line in tqdm(f_in, total=total_lines, desc="Migrating records"):
            try:
                old_record = json.loads(line)
                q_rec, n_rec = migrate_record(old_record)
                f_q_out.write(json.dumps(q_rec, ensure_ascii=False) + "\n")
                f_n_out.write(json.dumps(n_rec, ensure_ascii=False) + "\n")
            except json.JSONDecodeError:
                print(f"Skipping line due to JSON error: {line.strip()}")
                continue
    
    print("\nMigration complete!")
    print(f"New Qdrant file created: {new_qdrant_file}")
    print(f"New Neo4j file created: {new_neo4j_file}")
    print("\nNext steps:")
    print(f"1. (Optional) Update your .env file to point INPUT_JSONL to the new '_migrated.jsonl' files.")
    print(f"2. Run 'upsert_to_qdrant_2.py' and 'upsert_facts_to_neo4j.py' using the new files as input.")


if __name__ == "__main__":
    main()
