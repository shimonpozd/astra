"""Daily text assembly helpers."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from itertools import zip_longest
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .formatter import clean_html, extract_hebrew_only
from .range_handlers import (
    handle_inter_chapter_range,
    handle_jerusalem_talmud_range,
    try_load_range,
)
from .parsers import parse_ref

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DailyTextPayload:
    segments: List[Dict[str, Any]]
    focus_index: int
    ref: str
    he_ref: Optional[str]


async def build_full_daily_text(
    ref: str,
    sefaria_service: Any,
    index_service: Any,  # Reserved for future enhancements / parity with legacy signature
    *,
    session_id: Optional[str] = None,
    redis_client: Any = None,
) -> Optional[Dict[str, Any]]:
    """Return the full daily payload for ``ref`` using modular helpers."""

    _ = index_service  # compatibility placeholder; kept for signature parity
    data = await _load_primary_range(ref, sefaria_service)
    if data is None:
        logger.debug("daily_text.primary_range.miss", extra={"ref": ref})
        special = await _handle_special_ranges(
            ref,
            sefaria_service,
            session_id=session_id,
            redis_client=redis_client,
        )
        if special:
            return special
        return None

    payload = _build_payload_from_data(ref, data)
    if payload is None:
        logger.warning("daily_text.payload.empty", extra={"ref": ref})
        return None

    return {
        "segments": payload.segments,
        "focusIndex": payload.focus_index,
        "ref": payload.ref,
        "he_ref": payload.he_ref,
    }


async def _load_primary_range(ref: str, sefaria_service: Any) -> Optional[Dict[str, Any]]:
    """Fetch the main Sefaria payload for the reference if available."""

    try:
        return await try_load_range(sefaria_service, ref)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("daily_text.primary_range.exception", extra={"ref": ref, "error": str(exc)})
        return None


async def _handle_special_ranges(
    ref: str,
    sefaria_service: Any,
    *,
    session_id: Optional[str],
    redis_client: Any,
) -> Optional[Dict[str, Any]]:
    """Fallback handlers for ranges that require bespoke orchestration."""

    lowered = ref.lower()
    if "jerusalem talmud" in lowered and ":" in ref and "-" in ref:
        logger.debug("daily_text.special_range.jerusalem", extra={"ref": ref})
        return await handle_jerusalem_talmud_range(
            ref,
            sefaria_service,
            session_id=session_id,
            redis_client=redis_client,
        )

    if _looks_like_inter_chapter_range(ref):
        logger.debug("daily_text.special_range.inter_chapter", extra={"ref": ref})
        return await handle_inter_chapter_range(
            ref,
            sefaria_service,
            session_id=session_id,
            redis_client=redis_client,
        )

    return None


def _build_payload_from_data(ref: str, data: Dict[str, Any]) -> Optional[DailyTextPayload]:
    """Convert Sefaria response data into the daily payload."""

    segments = _extract_segments(ref, data)
    if not segments:
        return None

    formatted_segments = _format_segments_for_daily(segments)
    focus_index = 0

    return DailyTextPayload(
        segments=formatted_segments,
        focus_index=focus_index,
        ref=data.get("ref", ref),
        he_ref=data.get("heRef"),
    )


def _extract_segments(ref: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten the Sefaria payload into raw segment dictionaries."""

    text = data.get("text_segments") or data.get("text")
    he = data.get("he_segments") or data.get("he")

    if _is_spanning_payload(data):
        return list(_iter_spanning_segments(ref, data, text, he))

    if isinstance(text, list):
        return list(_iter_flat_segments(ref, data, text, he))

    # Single blob of text; treat as one segment
    if isinstance(text, str) or isinstance(he, str):
        segment_ref = data.get("ref", ref)
        return [
            _raw_segment(
                segment_ref,
                text,
                he,
                data,
            )
        ]

    return []


def _is_spanning_payload(data: Dict[str, Any]) -> bool:
    text = data.get("text")
    if not isinstance(text, list):
        return False
    return any(isinstance(item, list) for item in text) or bool(data.get("isSpanning"))


def _iter_spanning_segments(
    ref: str,
    data: Dict[str, Any],
    text_sections: Any,
    he_sections: Any,
) -> Iterable[Dict[str, Any]]:
    text_sections = text_sections or []
    he_sections = he_sections or []
    spanning_refs = data.get("spanningRefs") or []

    for section_idx, text_section in enumerate(text_sections):
        he_section = he_sections[section_idx] if section_idx < len(he_sections) else []
        base_ref = spanning_refs[section_idx] if section_idx < len(spanning_refs) else data.get("ref", ref)
        if not isinstance(text_section, list):
            continue

        start_ref, start_ordinal = _parse_start_ref(base_ref)

        for line_idx, (en_line, he_line) in enumerate(
            zip_longest(text_section, he_section, fillvalue="")
        ):
            segment_ref = _compose_segment_ref(start_ref, start_ordinal + line_idx)
            yield _raw_segment(segment_ref, en_line, he_line, data)


def _iter_flat_segments(
    ref: str,
    data: Dict[str, Any],
    text_values: List[Any],
    he_values: Any,
) -> Iterable[Dict[str, Any]]:
    prefix, start_index = _parse_start_ref(data.get("ref", ref))

    for idx, en_line in enumerate(text_values):
        he_line = _safe_index(he_values, idx)
        segment_ref = _compose_segment_ref(prefix, start_index + idx)
        yield _raw_segment(segment_ref, en_line, he_line, data)


def _raw_segment(
    segment_ref: str,
    en_source: Any,
    he_source: Any,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    he_candidate = he_source
    if not he_candidate:
        he_candidate = data.get("he_text") or data.get("he")
    en_candidate = en_source
    if not en_candidate:
        en_candidate = data.get("en_text") or data.get("text")

    he_text_raw = extract_hebrew_only(he_candidate)
    he_text = str(he_text_raw or "")
    en_text = clean_html(str(en_candidate or "")).strip()

    text_value = he_text or en_text

    meta: Dict[str, Any] = {
        "title": data.get("title") or data.get("book") or "",
        "indexTitle": data.get("indexTitle") or data.get("title") or "",
        "heRef": data.get("heRef", ""),
    }

    parsed = parse_ref(segment_ref)
    if parsed.collection == "talmud":
        if parsed.page is not None:
            meta["page"] = parsed.page
        if parsed.amud:
            meta["amud"] = parsed.amud
        if parsed.segment is not None:
            meta["segment"] = parsed.segment
    else:
        if parsed.chapter is not None:
            meta["chapter"] = parsed.chapter
        if parsed.verse is not None:
            meta["verse"] = parsed.verse

    canonical_ref = segment_ref.strip()
    book_name = parsed.book or meta.get("title") or data.get("book") or ""
    if meta.get("chapter") is not None and meta.get("verse") is not None:
        canonical_ref = f"{book_name} {int(meta['chapter'])}:{int(meta['verse'])}"
    elif (
        meta.get("page") is not None
        and meta.get("amud")
        and meta.get("segment") is not None
    ):
        canonical_ref = f"{book_name} {int(meta['page'])}{meta['amud']}.{int(meta['segment'])}"

    return {
        "ref": canonical_ref,
        "text": text_value,
        "heText": he_text or text_value,
        "enText": en_text or None,
        "metadata": meta,
    }


def _format_segments_for_daily(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    total = len(segments)
    if total == 0:
        return []

    formatted: List[Dict[str, Any]] = []
    for idx, segment in enumerate(segments):
        position = idx / (total - 1) if total > 1 else 0.5
        formatted.append(
            {
                "ref": segment["ref"],
                "text": segment["text"],
                "heText": segment["heText"],
                "position": float(position),
                "metadata": segment["metadata"],
            }
        )
    return formatted


def _compose_segment_ref(base_ref: Optional[str], ordinal: int) -> str:
    base_ref = (base_ref or "").strip()
    if not base_ref:
        return f"Segment {ordinal}"
    if ":" in base_ref:
        prefix = base_ref.rsplit(":", 1)[0]
        return f"{prefix}:{ordinal}"
    return f"{base_ref}:{ordinal}"


def _parse_start_ref(base_ref: str) -> Tuple[str, int]:
    if "-" in base_ref:
        start_ref = base_ref.split("-", 1)[0].strip()
    else:
        start_ref = base_ref.strip()

    if ":" in start_ref:
        prefix, maybe_num = start_ref.rsplit(":", 1)
        try:
            return prefix, int(maybe_num)
        except ValueError:
            return start_ref, 1
    return start_ref, 1


def _safe_index(source: Any, index: int) -> Any:
    if isinstance(source, list):
        if 0 <= index < len(source):
            return source[index]
        return ""
    return source


def _looks_like_inter_chapter_range(ref: str) -> bool:
    if "-" not in ref or ":" not in ref:
        return False
    try:
        start_part, end_part = ref.split("-", 1)
        start_chapter = int(start_part.rsplit(":", 2)[-2])
        end_chapter = int(end_part.rsplit(":", 2)[-2])
        return start_chapter != end_chapter
    except (ValueError, IndexError):
        return False

