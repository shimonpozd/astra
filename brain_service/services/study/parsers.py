"""Reference parsing helpers for the modular study service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

Collection = Literal["talmud", "bible", "mishnah", "midrash", "unknown"]


@dataclass(slots=True)
class ParsedRef:
    """Structured representation of a study reference."""

    book: str
    chapter: Optional[int] = None
    verse: Optional[int] = None
    amud: Optional[str] = None
    page: Optional[int] = None
    collection: Collection = "unknown"


def detect_collection(ref: str) -> Collection:
    """Return the collection for the provided reference.

    Placeholder implementation retained until the new navigator lands.
    """

    if not ref:
        return "unknown"
    lowered = ref.lower()
    if "daf" in lowered or "amud" in lowered:
        return "talmud"
    if lowered.startswith("mishnah"):
        return "mishnah"
    return "unknown"


def parse_ref(ref: str) -> ParsedRef:
    """Parse a textual reference into a structured object.

    The final implementation will lean on the Sefaria index; for now we
    return a minimal stub so that unit tests can target the interface without
    being bound to legacy utils.
    """

    return ParsedRef(book=ref.split()[0] if ref else "", collection=detect_collection(ref))
