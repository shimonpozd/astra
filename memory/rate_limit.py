import redis.asyncio as redis
import time
from typing import Tuple
from .config import settings

class RateLimiter:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    async def is_allowed(self, user_id: str, session_id: str) -> Tuple[bool, int]:
        """Checks rate limit and cooldown. Returns (is_allowed, retry_after_seconds)."""
        current_time = int(time.time())

        # Cooldown check (per session)
        cooldown_key = f"cooldown:{session_id}"
        last_call_time = await self.client.get(cooldown_key)
        if last_call_time and current_time - int(last_call_time) < settings.recall_cooldown_seconds:
            retry_after = settings.recall_cooldown_seconds - (current_time - int(last_call_time))
            return False, retry_after

        # Rate limit check (per user)
        rate_limit_key = f"ratelimit:{user_id}:{current_time // 60}" # Per-minute bucket
        try:
            current_requests = await self.client.incr(rate_limit_key)
            if current_requests == 1:
                await self.client.expire(rate_limit_key, 60)
            
            if current_requests > settings.recall_rate_limit_per_minute:
                return False, 60 - (current_time % 60)

        except Exception as e:
            print(f"Redis INCR/EXPIRE for rate limit failed: {e}")
            # Fail open if redis fails
            return True, 0

        # If all checks pass, update the cooldown timestamp
        try:
            await self.client.set(cooldown_key, current_time, ex=settings.recall_cooldown_seconds * 2)
        except Exception as e:
            print(f"Redis SET for cooldown failed: {e}")

        return True, 0

rate_limiter = RateLimiter()
