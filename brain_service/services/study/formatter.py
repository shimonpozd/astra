"""Formatting helpers for study segments."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(slots=True)
class FrontSegment:
    """Segment schema consumed by the front-end."""

    ref: str
    heText: str
    enText: Optional[str]
    position: float
    meta: Dict[str, Any]


def clean_html(text: str) -> str:
    """Return ``text`` with leading/trailing whitespace trimmed.

    The full HTML sanitizer will be plugged in during later phases.
    """

    return text.strip()


def extract_hebrew_only(text: str) -> str:
    """Placeholder that currently returns the input unchanged."""

    return text


def to_front_segments(raw_segments: List[Dict[str, Any]]) -> List[FrontSegment]:
    """Convert raw segments into ``FrontSegment`` instances."""

    front_segments: List[FrontSegment] = []
    for index, segment in enumerate(raw_segments):
        ref = segment.get("ref", "")
        he_text = segment.get("heText") or ""
        en_text = segment.get("enText")
        meta = segment.get("meta") or {}
        position = segment.get("position")
        if position is None:
            position = index / max(len(raw_segments) - 1, 1)
        front_segments.append(
            FrontSegment(ref=ref, heText=he_text, enText=en_text, position=float(position), meta=meta)
        )
    return front_segments
