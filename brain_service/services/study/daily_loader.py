"""Daily loading planning and orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List


@dataclass(slots=True)
class SegmentPlan:
    """Represents a slice of work for the daily loader."""

    ref: str
    start: int
    end: int


class DailyLoader:
    """Placeholder implementation for background loading orchestration."""

    def __init__(self, redis_repo: Any, *, batch_size: int = 20) -> None:
        self._redis_repo = redis_repo
        self._batch_size = batch_size

    def plan_initial_segments(self, ref: str, length: int) -> List[SegmentPlan]:
        """Return a naive plan until the real segmentation logic is ported."""

        if length <= 0:
            return []
        return [SegmentPlan(ref=ref, start=0, end=min(length, self._batch_size))]

    async def load_initial(self, plan: List[SegmentPlan]) -> List[dict]:  # pragma: no cover - placeholder
        raise NotImplementedError("load_initial will be implemented with the modular daily loader")

    async def load_background(self, session_id: str, plan: List[SegmentPlan], task_id: str) -> None:
        raise NotImplementedError("load_background will be implemented with the modular daily loader")
