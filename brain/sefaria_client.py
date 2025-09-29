import asyncio
from urllib.parse import quote
import os
import logging
import re
from typing import Dict, Any, List, Optional
import json
import unicodedata

from .state import state
from .sefaria_utils import CompactText, compact_and_deduplicate_links, _get
from .sefaria_index import resolve_book_name

import logging_utils

logger = logging_utils.get_logger(__name__)

_SANITIZE_TRANSLATION = str.maketrans({
    "’": "'", "‘": "'", "ʼ": "'", "ʻ": "'", "´": "'",
    "–": "-", "—": "-",
})

def ok_and_has_text(raw: Any) -> bool:
    #logger.info(f"SEFARIA_CLIENT: ok_and_has_text called with raw: {raw}, type: {type(raw)}, is_dict: {isinstance(raw, dict)}")
    if not isinstance(raw, dict) or raw.get("error"):
        return False
    return bool(raw.get("text") or raw.get("he") or raw.get("versions"))

async def normalize_tref(tref: str) -> str:
    if not isinstance(tref, str):
        return tref

    # NFKC normalization
    s = unicodedata.normalize('NFKC', tref)
    # Remove LTR/RTL marks
    s = s.replace("\u200f", "").replace("\u200e", "")
    # Sanitize apostrophes and dashes
    s = s.translate(_SANITIZE_TRANSLATION)
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s.strip())
    # Fix commas
    s = re.sub(r"\s+,", ",", s)
    s = re.sub(r",\s+", ", ", s)

    # Specific aliases
    s = re.sub(r"Shulchan Arukh", "Shulchan Aruch", s, flags=re.IGNORECASE)
    s = re.sub(r"De’ah|De´ah|De`ah", "Deah", s, flags=re.IGNORECASE)

    return s

async def _with_retries(coro_factory, attempts=3, base_delay=0.5):
    delay = base_delay
    for i in range(attempts):
        try:
            return await coro_factory()
        except Exception as e:
            if i == attempts - 1:
                raise
            await asyncio.sleep(delay)
            delay *= 2

async def sefaria_get_text_v3_async(tref: str, lang: str | None = None) -> dict:
    base_ref = await normalize_tref(tref)

    # Generate candidate refs to handle Sefaria API inconsistencies
    candidates = [
        base_ref,
        base_ref.replace("Aruch", "Arukh"),
        base_ref.replace("Arukh", "Aruch"),
        base_ref.replace("HaChayim", "HaChaim"),
        base_ref.replace("HaChaim", "HaChayim"),
        base_ref.replace("Be’er Heitev", "Be'er Hetev"),
        re.sub(r' on Shulchan Aruch, Orach Chayim', ', Orach Chayim', base_ref),
    ]
    unique_candidates = list(dict.fromkeys(c for c in candidates if c))

    params = {"return_format": "text_only"}
    if lang:
        params["lang"] = lang
    else:
        # Default to a bilingual request if no specific language is requested
        params["version"] = ["english", "hebrew"]

    for candidate_ref in unique_candidates:
        logger.info(f"SEFARIA_CLIENT: Attempting v3 fetch for ref: '{candidate_ref}' with params: {params}")
        try:
            raw = await _with_retries(lambda: _get(f"v3/texts/{quote(candidate_ref)}", params=params))
            if ok_and_has_text(raw):
                logger.info(f"SEFARIA_CLIENT: v3 fetch SUCCEEDED for ref: '{candidate_ref}'")
                return {"ok": True, "data": CompactText(raw).to_dict_min()}
        except Exception as e:
            logger.warning(f"SEFARIA_CLIENT: v3 fetch FAILED for {candidate_ref} with {params}: {e}")

    logger.error(f"All text fetch attempts failed for base ref: '{base_ref}'")
    return {"ok": False, "error": f"Text not found for '{base_ref}' after trying all variations."}


async def sefaria_get_related_links_async(ref: str, categories: list[str] | None = None, limit: int = 120) -> dict:
    ref = await normalize_tref(ref)
    links = []
    # Use /api/links as the primary, most reliable source of refs
    try:
        logger.info(f"Fetching related links for '{ref}' via /api/links/")
        l = await _with_retries(lambda: _get(f"links/{quote(ref)}", params={"with_text": 0, "with_sheet_links": 0}))
        links = l if isinstance(l, list) else l.get("links", [])
    except Exception as e:
        logger.error(f"/api/links call failed for {ref}: {e}", exc_info=True)

    # Fallback to /related if /links returns nothing
    if not links:
        logger.info(f"/api/links returned no data, falling back to /api/related for '{ref}'")
        try:
            r = await _with_retries(lambda: _get(f"related/{quote(ref)}"))
            links = (r or {}).get("links") or []
        except Exception as e:
            logger.error(f"/api/related call failed for {ref}: {e}", exc_info=True)

    raw_count = len(links)

    # No pre-flight check needed if we trust the /links endpoint

    # filter, deduplicate, and limit
    # If no categories are specified, default to a comprehensive list.
    if not categories:
        cats = ['Commentary', 'Midrash', 'Halakhah', 'Targum', 'Philosophy', 'Liturgy', 'Kabbalah', 'Tanaitic', 'Modern Commentary']
    else:
        cats = categories

    compacted = compact_and_deduplicate_links(links, categories=cats, limit=limit)

    logger.info(f"Links summary: raw={raw_count}, validated={len(links)}, final={len(compacted)}, cats={sorted(set(i.get('category') for i in compacted))}")
    return {"ok": True, "data": compacted}

