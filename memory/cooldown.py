
import redis.asyncio as redis
from typing import Tuple, List, Optional

from .config import settings

class CooldownManager:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)
        self.cooldown_turns = settings.proactive_cooldown_turns

    def _get_keys(self, session_id: str) -> Tuple[str, str]:
        last_tactic_key = f"cooldown:last_tactic:{session_id}"
        turn_count_key = f"cooldown:turn_count:{session_id}"
        return last_tactic_key, turn_count_key

    async def check_and_filter(
        self, session_id: str, candidates: List[str]
    ) -> Tuple[bool, List[str]]:
        """Checks cooldown and filters candidates."""
        last_tactic_key, turn_count_key = self._get_keys(session_id)

        # Get both values in one transaction
        pipe = self.client.pipeline()
        pipe.get(last_tactic_key)
        pipe.get(turn_count_key)
        last_tactic, turn_count_str = await pipe.execute()

        turn_count = int(turn_count_str) if turn_count_str else 0

        # Rule: Cooldown is active if a tactic was used in the last N turns
        cooldown_active = turn_count < self.cooldown_turns
        if cooldown_active:
            return False, [] # Proactive suggestions not allowed

        # Rule: Filter out the last used tactic
        if last_tactic:
            candidates = [c for c in candidates if c != last_tactic]
        
        return True, candidates

    async def record_tactic_used(self, session_id: str, tactic: str):
        """Records that a tactic was used and resets the cooldown counter."""
        last_tactic_key, turn_count_key = self._get_keys(session_id)
        
        pipe = self.client.pipeline()
        pipe.set(last_tactic_key, tactic, ex=3600) # Expire after 1h
        pipe.set(turn_count_key, 0, ex=3600)
        await pipe.execute()

    async def increment_turn_count(self, session_id: str):
        """Increments the turn counter for a session."""
        _, turn_count_key = self._get_keys(session_id)
        await self.client.incr(turn_count_key)
        await self.client.expire(turn_count_key, 3600)

# --- Global Instance ---
cooldown_manager = CooldownManager()
