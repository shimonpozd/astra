import os
import json
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from tqdm import tqdm
from tenacity import retry, stop_after_attempt, wait_exponential
from openai import OpenAI
import hashlib
from datetime import datetime, timezone

try:
    from qdrant_client import QdrantClient, models as qmodels
except Exception:
    QdrantClient, qmodels = None, None

# ----------------- Embeddings -----------------
class OpenAIEmbedder:
    def __init__(self, api_key: str, emb_model: str):
        self.client = OpenAI(api_key=api_key)
        self.emb_model = emb_model

    @retry(reraise=True, stop=stop_after_attempt(5), wait=wait_exponential(min=1, max=20))
    def embed(self, text: str) -> List[float]:
        text = text.strip()
        resp = self.client.embeddings.create(model=self.emb_model, input=text)
        return resp.data[0].embedding

class QdrantUploader:
    def __init__(self, client: QdrantClient, collection_name: str, batch_size: int = 50):
        self.client = client
        self.collection_name = collection_name
        self.batch_size = batch_size
        self.buffer = []

    def add_point(self, point_id: str, vector: List[float], payload: Dict[str, Any]):
        self.buffer.append(
            qmodels.PointStruct(
                id=point_id,
                vector=vector,
                payload=payload
            )
        )
        if len(self.buffer) >= self.batch_size:
            self.flush()

    def flush(self):
        if self.buffer:
            self.client.upsert(
                collection_name=self.collection_name,
                points=self.buffer,
                wait=True
            )
            self.buffer.clear()

def read_qdrant_progress(progress_file_path: str) -> int:
    """Reads the last upserted point_id from the Qdrant progress file."""
    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("last_upserted_chunk_index", -1) # Use -1 to indicate no progress
        except json.JSONDecodeError:
            print(f"[WARN] Could not decode Qdrant progress file: {progress_file_path}. Starting from beginning.", flush=True)
            return -1
    return -1

def write_qdrant_progress(progress_file_path: str, chunk_index: int):
    """Writes the current upserted chunk index to the Qdrant progress file."""
    with open(progress_file_path, "w", encoding="utf-8") as f:
        json.dump({"last_upserted_chunk_index": chunk_index}, f)

async def main():
    load_dotenv(override=True)

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
    EMB_MODEL = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")

    if not OPENAI_API_KEY:
        print("[ERROR] OPENAI_API_KEY is not set. Cannot generate embeddings.", flush=True)
        return

    embedder = OpenAIEmbedder(api_key=OPENAI_API_KEY, emb_model=EMB_MODEL)

    OUTPUT_JSON_PATH = os.getenv("OUTPUT_JSON_PATH", "facts_sample.jsonl")
    QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION_NAME = os.getenv("QDRANT_COLLECTION_NAME", "memory2_0")
    QDRANT_BATCH_SIZE = int(os.getenv("QDRANT_BATCH_SIZE", "50"))

    if not QdrantClient:
        print("[ERROR] Qdrant client not installed. Please install with: pip install qdrant-client", flush=True)
        return

    qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Get or create collection
    try:
        qdrant_client.get_collection(collection_name=QDRANT_COLLECTION_NAME)
        print(f"[INFO] Qdrant collection '{QDRANT_COLLECTION_NAME}' already exists.", flush=True)
    except Exception: # Collection does not exist
        print(f"[INFO] Creating Qdrant collection '{QDRANT_COLLECTION_NAME}'...", flush=True)
        # Need to get vector size from embedder
        try:
            test_embedding = embedder.embed("test")
            vector_size = len(test_embedding)
        except Exception as e:
            print(f"[ERROR] Could not determine vector size from embedder: {e}. Qdrant collection creation failed.", flush=True)
            return

        qdrant_client.recreate_collection( # Using recreate for simplicity, can be changed to create_collection
            collection_name=QDRANT_COLLECTION_NAME,
            vectors_config=qmodels.VectorParams(size=vector_size, distance=qmodels.Distance.COSINE),
        )
        print(f"[INFO] Qdrant collection '{QDRANT_COLLECTION_NAME}' created.", flush=True)

    qdrant_uploader = QdrantUploader(qdrant_client, QDRANT_COLLECTION_NAME, QDRANT_BATCH_SIZE)

    processed_count = 0
    if os.path.exists(OUTPUT_JSON_PATH):
        with open(OUTPUT_JSON_PATH, "r", encoding="utf-8") as f:
            # Count total lines for tqdm
            total_lines = sum(1 for line in f)
            f.seek(0) # Reset file pointer

            for line in tqdm(f, total=total_lines, desc="Upserting to Qdrant", unit="fact"):
                try:
                    fact = json.loads(line)

                    if "point_id" in fact and "semantic_summary" in fact: # Check for semantic_summary to embed
                        try:
                            embedding = embedder.embed(fact["semantic_summary"])
                            # Generate hash and created_at if not present in the fact
                            fact_hash = fact.get("hash")
                            if not fact_hash and "semantic_summary" in fact:
                                fact_hash = hashlib.md5(fact["semantic_summary"].encode('utf-8')).hexdigest()

                            fact_created_at = fact.get("created_at")
                            if not fact_created_at:
                                fact_created_at = datetime.now(timezone.utc).isoformat()

                            payload = {
                                "user_id": "default_user",
                                "data": fact["semantic_summary"],
                                "hash": fact_hash,
                                "created_at": fact_created_at
                            }
                            qdrant_uploader.add_point(fact["point_id"], embedding, payload)
                            processed_count += 1
                        except Exception as e:
                            print(f"[ERROR] Failed to generate embedding for fact {fact.get('point_id', 'N/A')}: {e}", flush=True)
                    else:
                        print(f"[WARN] Skipping fact due to missing point_id or semantic_summary: {fact.get('point_id', 'N/A')}", flush=True)
                except json.JSONDecodeError:
                    print(f"[WARN] Skipping malformed line in {OUTPUT_JSON_PATH}: {line.strip()}", flush=True)
                except Exception as e:
                    print(f"[ERROR] Error processing fact: {e}. Fact: {line.strip()}", flush=True)

    qdrant_uploader.flush() # Flush any remaining points
    print(f"[INFO] Finished upserting {processed_count} new facts to Qdrant.", flush=True)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())