"""Redis repository for study domain state."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional


@dataclass(slots=True)
class RedisKeys:
    """Namespace helpers for study-related Redis keys."""

    window_prefix: str = "study:window"
    daily_session_prefix: str = "daily:sess"
    daily_top_prefix: str = "daily:top"

    def window(self, ref: str) -> str:
        return f"{self.window_prefix}:{ref}"

    def daily_segments(self, session_id: str) -> str:
        return f"{self.daily_session_prefix}:{session_id}:segments"

    def daily_total(self, session_id: str) -> str:
        return f"{self.daily_session_prefix}:{session_id}:total"

    def daily_lock(self, session_id: str) -> str:
        return f"{self.daily_session_prefix}:{session_id}:lock"

    def daily_task(self, session_id: str, task_id: str) -> str:
        return f"{self.daily_session_prefix}:{session_id}:task:{task_id}"

    def daily_top(self, session_id: str) -> str:
        return f"{self.daily_top_prefix}:{session_id}"


class StudyRedisRepository:
    """Placeholder repository that will wrap all Redis interactions."""

    def __init__(self, redis_client: Any, *, keys: Optional[RedisKeys] = None) -> None:
        self._redis = redis_client
        self._keys = keys or RedisKeys()

    async def push_segment(self, session_id: str, segment_json: str, ttl_seconds: int) -> None:
        raise NotImplementedError("push_segment will be implemented during the daily loader extraction")

    async def set_total(self, session_id: str, total: int, ttl_seconds: int) -> None:
        raise NotImplementedError("set_total will be implemented during the daily loader extraction")

    async def try_lock(self, session_id: str, ttl_seconds: int) -> bool:
        raise NotImplementedError("try_lock will be implemented during the daily loader extraction")

    async def release_lock(self, session_id: str) -> None:
        raise NotImplementedError("release_lock will be implemented during the daily loader extraction")

    async def mark_task(self, session_id: str, task_id: str, ttl_seconds: int) -> None:
        raise NotImplementedError("mark_task will be implemented during the daily loader extraction")

    async def is_task_marked(self, session_id: str, task_id: str) -> bool:
        raise NotImplementedError("is_task_marked will be implemented during the daily loader extraction")

    async def fetch_segments(self, session_id: str, start: int, end: int) -> Iterable[str]:
        raise NotImplementedError("fetch_segments will be implemented during the daily loader extraction")

    async def set_top_ref(self, session_id: str, payload_json: str, ttl_seconds: int) -> None:
        raise NotImplementedError("set_top_ref will be implemented during the daily loader extraction")

    async def get_top_ref(self, session_id: str) -> Optional[str]:
        raise NotImplementedError("get_top_ref will be implemented during the daily loader extraction")

    async def cache_window(self, ref: str, payload_json: str, ttl_seconds: int) -> None:
        raise NotImplementedError("cache_window will be implemented during the navigator extraction")

    async def fetch_window(self, ref: str) -> Optional[str]:
        raise NotImplementedError("fetch_window will be implemented during the navigator extraction")
