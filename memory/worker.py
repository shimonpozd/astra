import asyncio
import redis.asyncio as aredis
import json
import logging
import hashlib
import uuid
import time
from typing import Dict, Any

from .config import settings
from .models import MemoryItem
from .graph_db import graph_db_client
from .k_graph import k_graph_client

# Use logging_utils to get a configured logger
from logging_utils import get_logger
logger = get_logger("memory.worker", service="memory")

def generate_slug(name: str) -> str:
    return name.lower().replace(' ', '-').strip()

async def ingest_fact(fact_item: Dict[str, Any], collection: str):
    """
    Idempotent fact ingestion pipeline. Logging is handled by the calling worker.
    """
    try:
        metadata = fact_item.get("metadata") or {}
        text = fact_item.get("text", "")
        if not text:
            logger.warning("Skipping ingestion of empty text chunk", extra={"event": "ingest_skip", "reason": "empty_text"})
            return

        session_id = fact_item.get("session_id", "unknown")
        fact_id_basis = "|".join(str(p) for p in (session_id, collection, metadata.get("origin_ref"), metadata.get("commentator"), metadata.get("chunk_index")))
        fact_id = hashlib.sha256(f"{fact_id_basis}|{text}".encode("utf-8")).hexdigest()

        embedding = await k_graph_client._get_embedding(text)

        # Simplified Neo4j and Qdrant upsert logic from the original file
        # ... (neo4j_query and graph_db_client.run_query call) ...
        # ... (qdrant_cli.upsert call) ...
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, fact_id))
        await asyncio.to_thread(
            k_graph_client.qdrant_cli.upsert,
            collection_name=collection,
            points=[{"id": point_id, "vector": embedding, "payload": {"fact_id": fact_id, "text": text, **metadata}}]
        )

    except Exception as e:
        logger.error(f"Failed to ingest fact: {e}", exc_info=True, extra={"event": "ingest_fact_failed"})
        raise # Re-raise the exception to be caught by the worker loop

async def run_worker():
    """
    Worker that fetches items from Redis and ingests them, with summary logging.
    """
    redis_client = aredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Ingest worker started and connected to Redis", extra={"event": "worker_started"})

    processed_count = 0
    error_count = 0
    last_log_time = time.time()
    log_interval = 10  # Log summary every 10 seconds

    try:
        while True:
            try:
                items_json = await redis_client.blpop(settings.ingest_queue_name, timeout=5)
                if not items_json:
                    # Log summary if interval has passed and there's something to log
                    if time.time() - last_log_time > log_interval and (processed_count > 0 or error_count > 0):
                        logger.info(f"Ingestion summary: {processed_count} success, {error_count} errors.", extra={
                            "event": "ingestion_summary",
                            "processed_count": processed_count,
                            "error_count": error_count,
                            "period_seconds": int(time.time() - last_log_time)
                        })
                        processed_count = 0
                        error_count = 0
                        last_log_time = time.time()
                    continue

                payload = json.loads(items_json[1])
                item_data = json.loads(payload["item_json"])
                collection = payload["collection"]

                await ingest_fact(item_data, collection)
                processed_count += 1

            except asyncio.CancelledError:
                logger.info("Ingest worker received cancellation request.", extra={"event": "worker_cancelled"})
                break
            except Exception as e:
                error_count += 1
                logger.error(f"An error occurred in ingest worker loop: {e}", exc_info=True, extra={"event": "worker_loop_error"})
                await asyncio.sleep(1) # Avoid rapid-fire errors
    finally:
        # Final log before shutting down
        if processed_count > 0 or error_count > 0:
            logger.info(f"Final ingestion summary: {processed_count} success, {error_count} errors.", extra={
                "event": "ingestion_summary",
                "processed_count": processed_count,
                "error_count": error_count,
                "period_seconds": int(time.time() - last_log_time)
            })
        await redis_client.close()
        logger.info("Ingest worker shut down gracefully.", extra={"event": "worker_shutdown"})