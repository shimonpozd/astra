#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
upsert_to_qdrant_2.py - Upserts facts to Qdrant from a JSONL file with corrected embedding logic
and backward compatibility for flat/nested JSON structures.
"""

import os
import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient, models
from openai import OpenAI
from tqdm import tqdm

# ----------------- Logging Setup -----------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ----------------- Configuration -----------------
class Config:
    def __init__(self):
        load_dotenv(override=True)
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY")
        self.collection_name = os.getenv("COLLECTION_NAME", "chat_facts")
        self.input_jsonl = os.getenv("INPUT_JSONL", "facts_for_qdrant.jsonl")
        
        self.embed_mode = os.getenv("EMBED_MODE", "openai")
        self.embedding_model_name = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")
        
        # OpenAI specific
        self.openai_api_key = os.getenv("OPENAI_API_KEY")

        # Ollama specific
        self.ollama_api_url = os.getenv("OLLAMA_API_URL", "http://localhost:11434")

        self.batch_size = int(os.getenv("BATCH_SIZE", 128))
        self.dry_run = os.getenv("DRY_RUN", "0") == "1"

# ----------------- Embedder -----------------
class OllamaEmbedder:
    def __init__(self, api_url: str, model_name: str):
        if not api_url:
            raise ValueError("OLLAMA_API_URL is required for OllamaEmbedder")
        self.api_url = api_url
        self.model_name = model_name
        self.vector_size = self._get_vector_size()

    def _get_vector_size(self) -> int:
        logging.info(f"Determining vector size for model {self.model_name}...")
        try:
            response = requests.post(
                f"{self.api_url}/api/embeddings",
                json={"model": self.model_name, "input": "test"}
            )
            response.raise_for_status()
            embedding = response.json()["embedding"]
            size = len(embedding)
            logging.info(f"Determined vector size: {size}")
            return size
        except Exception as e:
            logging.warning(f"Could not determine vector size for model '{self.model_name}', falling back to 768. Error: {e}")
            return 768

    def encode(self, texts: List[str]) -> List[List[float]]:
        texts = [t.strip() for t in texts if t.strip()]
        if not texts:
            return []
        
        all_embeddings = []
        for text in texts:
            try:
                response = requests.post(
                    f"{self.api_url}/api/embeddings",
                    json={"model": self.model_name, "input": text}
                )
                response.raise_for_status()
                all_embeddings.append(response.json()["embedding"])
            except requests.RequestException as e:
                logging.error(f"Failed to get embedding for text chunk due to: {e}")
                all_embeddings.append([0.0] * self.vector_size) 
        return all_embeddings

class OpenAIEmbedder:
    def __init__(self, api_key: str, model_name: str):
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIEmbedder")
        self.client = OpenAI(api_key=api_key)
        self.model_name = model_name
        self.vector_size = self._get_vector_size()

    def _get_vector_size(self) -> int:
        logging.info(f"Determining vector size for model {self.model_name}...")
        embedding = self.encode(["test"])
        size = len(embedding[0])
        logging.info(f"Determined vector size: {size}")
        return size

    def encode(self, texts: List[str]) -> List[List[float]]:
        texts = [t if t.strip() else ' ' for t in texts]
        response = self.client.embeddings.create(model=self.model_name, input=texts)
        return [item.embedding for item in response.data]

# ----------------- Normalization (Compatibility Layer) -----------------
PERSON_SET = {"Шимон", "Казах"}

def normalize_record(raw: dict) -> Optional[Tuple[str, dict]]:
    """
    Validates and extracts the record ID and payload from the input JSON object.
    The input format is expected to be {"id": "...", "payload": {...}}.
    """
    if not isinstance(raw, dict):
        return None

    fact_id = raw.get("id")
    payload = raw.get("payload")

    if not fact_id or not isinstance(payload, dict):
        logging.warning(f"Skipping invalid record: 'id' or 'payload' missing. Data: {str(raw)[:200]}")
        return None

    # Basic validation based on the new structure
    if not payload.get("text") or not payload.get("timestamp"):
        logging.warning(f"Skipping record {fact_id}: 'text' or 'timestamp' missing in payload.")
        return None
    
    # Ensure required slug fields exist, even if empty
    payload.setdefault("topic_slugs", [])
    payload.setdefault("entity_slugs", [])

    return str(fact_id), payload

# ----------------- Qdrant Collection Setup -----------------
def setup_collection(client: QdrantClient, config: Config, vector_size: int):
    try:
        client.delete_collection(collection_name=config.collection_name)
        logging.info(f"Deleted existing collection '{config.collection_name}'.")
    except Exception as e:
        if "not found" not in str(e).lower() and "404" not in str(e):
             logging.warning(f"Could not delete collection '{config.collection_name}', it might not exist. Error: {e}")

    logging.info(f"Creating collection '{config.collection_name}' with vector size {vector_size}...")
    client.create_collection(
        collection_name=config.collection_name,
        vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE)
    )

    # Keyword indices for filtering
    keyword_fields = ["speaker", "participants", "entity_slugs", "topic_slugs", "chat_id"]
    for field in keyword_fields:
        client.create_payload_index(collection_name=config.collection_name, field_name=field, field_schema=models.PayloadSchemaType.KEYWORD, wait=True)
    
    # Full-text index for keyword search
    client.create_payload_index(
        collection_name=config.collection_name, 
        field_name="text", 
        field_schema=models.TextIndexParams(
            type="text",
            tokenizer=models.TokenizerType.WORD,
            min_token_len=2,
            max_token_len=20,
            lowercase=True
        ),
        wait=True
    )

    client.create_payload_index(collection_name=config.collection_name, field_name="date_int", field_schema=models.PayloadSchemaType.INTEGER, wait=True)
    logging.info("Payload indices created.")

# ----------------- Main Upsert Logic -----------------
def process_and_upsert_batch(client: QdrantClient, embedder, batch: List[Tuple[str, dict]], config: Config):
    if not batch:
        return

    texts_to_embed = []
    valid_facts = []
    for original_id, payload in batch:
        embed_text = payload.get("text_for_vector") or payload.get("text")
        if embed_text:
            texts_to_embed.append(embed_text)
            valid_facts.append((original_id, payload))
        else:
            logging.warning(f"Skipping fact with id {original_id} as it has no text to embed.")

    if not texts_to_embed:
        return

    embeddings = embedder.encode(texts_to_embed)
    
    points_batch = []
    for (original_id, payload), embedding in zip(valid_facts, embeddings):
        payload.pop("text_for_vector", None)
        point_id_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, original_id))
        payload["original_id"] = original_id
        points_batch.append(models.PointStruct(id=point_id_uuid, vector=embedding, payload=payload))

    if not config.dry_run and points_batch:
        client.upsert(collection_name=config.collection_name, points=points_batch, wait=True)

def run_upsert(config: Config):
    client = QdrantClient(url=config.qdrant_url, api_key=config.qdrant_api_key, prefer_grpc=True)
    embedder = None

    if config.embed_mode == 'openai':
        embedder = OpenAIEmbedder(api_key=config.openai_api_key, model_name=config.embedding_model_name)
    elif config.embed_mode == 'ollama':
        embedder = OllamaEmbedder(api_url=config.ollama_api_url, model_name=config.embedding_model_name)
    else:
        logging.error(f"Unsupported EMBED_MODE: '{config.embed_mode}'. Must be 'openai' or 'ollama'.")
        return

    vector_size = embedder.vector_size

    if not config.dry_run:
        setup_collection(client, config, vector_size)

    if not os.path.exists(config.input_jsonl):
        logging.error(f"Input file not found: {config.input_jsonl}")
        return

    facts_to_process = []
    
    try:
        total_lines = sum(1 for _ in open(config.input_jsonl, 'r', encoding='utf-8'))
    except Exception as e:
        logging.error(f"Could not count lines in file: {e}")
        return

    with open(config.input_jsonl, "r", encoding="utf-8") as f:
        for line in tqdm(f, total=total_lines, desc="Processing facts"):
            try:
                data = json.loads(line)
                norm = normalize_record(data)
                if not norm:
                    logging.warning(f"Skipping line after normalize (missing required fields): {line.strip()[:300]}")
                    continue
                
                facts_to_process.append(norm)

                if len(facts_to_process) >= config.batch_size:
                    process_and_upsert_batch(client, embedder, facts_to_process, config)
                    facts_to_process.clear()

            except json.JSONDecodeError:
                logging.warning(f"Skipping line due to JSONDecodeError: {line.strip()}")
                continue

    # Final batch
    if facts_to_process:
        process_and_upsert_batch(client, embedder, facts_to_process, config)

    logging.info("Upsert process finished.")

if __name__ == "__main__":
    run_upsert(Config())