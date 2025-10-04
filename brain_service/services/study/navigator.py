"""Window navigation utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional


@dataclass(slots=True)
class Neighbor:
    """Represents a neighboring reference in a study window."""

    ref: str
    exists: bool = True


async def neighbors(
    base_ref: str,
    count: int,
    *,
    sefaria_service: Optional[Any] = None,
) -> List[Neighbor]:
    """Return neighboring references around ``base_ref``.

    This is a placeholder that will be replaced once the navigator is
    extracted from the legacy service. It currently returns only the base
    reference marked as existing to simplify early wiring tests.
    """

    if count <= 0:
        return []
    return [Neighbor(ref=base_ref, exists=True)]
