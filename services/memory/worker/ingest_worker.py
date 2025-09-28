import redis
import json
import time
import logging
from typing import List

from app.config import settings
from app.models import MemoryItem
from app.mem0_client import m_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Ingest worker started. Connected to Redis.")

    while True:
        try:
            # Blocking pop with a timeout to avoid busy-waiting
            # This is a list of JSON strings
            items_json = redis_client.blpop(settings.ingest_queue_name, timeout=5)
            
            if not items_json:
                continue

            # blpop returns (queue_name, item)
            item_json = items_json[1]
            item_dict = json.loads(item_json)
            item = MemoryItem(**item_dict)

            # For simplicity, we process one item at a time.
            # For higher throughput, a batching mechanism would be better here.
            batch = [item]

            logger.info(f"Processing batch of {len(batch)} items.")
            m_client.store_batch(batch)

        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error in ingest worker: {e}")
            time.sleep(5) # Wait before retrying
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode item from queue: {e}")
        except Exception as e:
            logger.error(f"An unexpected error occurred in ingest worker: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
