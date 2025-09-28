import redis.asyncio as redis
import json
from typing import List
from .config import settings
from .models import MemoryItem

class IngestQueue:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)
        self.queue_name = settings.ingest_queue_name

    async def enqueue_batch(self, items: List[MemoryItem]) -> int:
        if not items:
            return 0
        try:
            # Pipeline for atomic batch insertion
            pipe = self.client.pipeline()
            for item in items:
                pipe.rpush(self.queue_name, item.model_dump_json())
            await pipe.execute()
            return len(items)
        except Exception as e:
            print(f"Redis RPUSH failed: {e}")
            return 0

ingest_queue = IngestQueue()
