import redis.asyncio as redis
import json
from . import models
from .config import settings

class RecallCache:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    async def get(self, key: str):
        try:
            cached = await self.client.get(key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Redis GET failed: {e}")
        return None

    async def set(self, key: str, value: list, ttl: int):
        try:
            await self.client.set(key, json.dumps(value), ex=ttl)
        except Exception as e:
            print(f"Redis SET failed: {e}")

recall_cache = RecallCache()
