import redis.asyncio as redis
import json
from typing import List
from .models import MemoryItem
from .config import settings

class IngestQueue:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)
        self.queue_name = settings.ingest_queue_name

    async def enqueue_batch(self, items: List[MemoryItem], collection: str) -> int:
        if not items:
            return 0
        try:
            # Pipeline for atomic batch insertion
            pipe = self.client.pipeline()
            for item in items:
                # Store a dictionary containing the item JSON and the collection name
                payload = {"item_json": item.model_dump_json(), "collection": collection}
                pipe.rpush(self.queue_name, json.dumps(payload))
            await pipe.execute()
            return len(items)
        except Exception as e:
            print(f"Redis RPUSH failed: {e}")
            return 0

ingest_queue = IngestQueue()
