# D:\AI\astra\brain\sefaria_client.py
import os
import time
import json
import asyncio
import re
from typing import Any, Dict, Optional, Set

from urllib.parse import urlencode, quote

from .state import state
from .metrics import metrics
import httpx
import logging

from collections import OrderedDict

logger = logging.getLogger("sefaria")

SEFARIA_BASE = os.getenv("SEFARIA_BASE_URL", "https://www.sefaria.org/api").rstrip("/")
SEFARIA_TIMEOUT = float(os.getenv("SEFARIA_TIMEOUT_SECONDS", "15"))
SEFARIA_RETRIES = int(os.getenv("SEFARIA_RETRIES", "3"))
PREFERRED_LANG = os.getenv("SEFARIA_PREFERRED_LANG", "ru")
FALLBACK_LANG = os.getenv("SEFARIA_FALLBACK_LANG", "en")
CACHE_TTL = int(os.getenv("SEFARIA_CACHE_TTL_SECONDS", "3600"))
MAX_BYTES = 120_000
MAX_LINES = 40

DEFAULT_LIMITS = {"links": 20, "sheets": 8, "webpages": 6, "topics": 10, "manuscripts": 6, "media": 6}

_TANAKH_SEGMENT_RE = re.compile(r"^[A-Za-z][A-Za-z ':-]*\s+\d+:\d+(\-\d+)?$")  # Daniel 3:15
_TALMUD_PAGE_RE   = re.compile(r"^[A-Za-z][A-Za-z ':-]*\s+\d+[ab]$")           # Berakhot 2a

_cache = OrderedDict()
_cache_lock = asyncio.Lock()

def _headers():
    return {"User-Agent": "AstraTorahBot/1.0 (+learn-only)"}

def _looks_like_segment(tref: str) -> bool:
    t = tref.strip()
    return bool(_TANAKH_SEGMENT_RE.match(t) or _TALMUD_PAGE_RE.match(t))

def too_big(obj) -> bool:
    try:
        return len(json.dumps(obj, ensure_ascii=False)) > MAX_BYTES
    except Exception:
        return True

def is_talmud_ref(tref: str) -> bool:
    return bool(_TALMUD_PAGE_RE.match(tref.strip()))

def clamp_lines(thin: Dict[str, Any], tref: Optional[str] = None) -> Dict[str, Any]:
    text = thin.get("text", [])
    if isinstance(text, list):
        max_lines = 8 if tref and is_talmud_ref(tref) else MAX_LINES
        if len(text) > max_lines:
            thin["text"] = text[:max_lines]
            note = f"clamped to {max_lines} lines"
            if is_talmud_ref(tref):
                note += " (Talmud chunk; request next for more)"
            thin["_note"] = note
    return thin

def _stable_params(params: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if params is None:
        return None
    return dict(sorted(params.items()))

def thin_v3_response(resp: Dict[str, Any]) -> Dict[str, Any]:
    if not resp.get("versions"):
        return {"ref": resp.get("ref"), "heRef": resp.get("heRef"), "text": [], "next": resp.get("next"), "prev": resp.get("prev")}
    v = resp["versions"][0]
    return {
        "ref": resp.get("ref"),
        "heRef": resp.get("heRef"),
        "text": v.get("text", []),
        "versionTitle": v.get("versionTitle"),
        "direction": v.get("direction"),
        "next": resp.get("next"),
        "prev": resp.get("prev")
    }

async def _get(path: str, params: Optional[Dict[str, Any]]=None) -> Dict[str, Any]:
    assert state.http_client, "HTTP client not initialized"
    
    metric_path = path.split('/')[0]
    cache_key = f"{path}?{urlencode(_stable_params(params))}" if params else path
    async with _cache_lock:
        if cache_key in _cache:
            data, expiry = _cache[cache_key]
            _cache.move_to_end(cache_key)
            if time.time() < expiry:
                metrics.record_tool_cache(f"sefaria_get_{metric_path}", "hit")
                return data
        metrics.record_tool_cache(f"sefaria_get_{metric_path}", "miss")

    url = f"{SEFARIA_BASE}/{path.lstrip('/')}"
    start_time = time.time()
    for i in range(SEFARIA_RETRIES):
        try:
            r = await state.http_client.get(url, params=params, headers=_headers(), timeout=SEFARIA_TIMEOUT)
            if r.status_code >= 500:
                raise httpx.HTTPError(f"Server {r.status_code}")
            r.raise_for_status()
            
            data = r.json()
            async with _cache_lock:
                _cache[cache_key] = (data, time.time() + CACHE_TTL)
                _cache.move_to_end(cache_key)
                if len(_cache) > 3000:
                    _cache.popitem(last=False)

            metrics.record_tool_latency(f"sefaria_get_{metric_path}", (time.time() - start_time) * 1000)
            return data
        except Exception as e:
            error_str = str(e)
            status = None
            if hasattr(e, 'response') and e.response:
                status = e.response.status_code
                error_str += f" (status: {status})"
            if i == SEFARIA_RETRIES - 1:
                logger.error(f"Sefaria GET failed: {url} params={params} err={error_str}")
                metrics.record_tool_error(f"sefaria_get_{metric_path}", error_str)
                return {"ok": False, "error": error_str, "_source": f"sefaria_get_{metric_path}"}
            await asyncio.sleep(0.5 * (2 ** i))

async def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    assert state.http_client, "HTTP client not initialized"
    url = f"{SEFARIA_BASE}/{path.lstrip('/')}"
    start_time = time.time()
    metric_path = path.split('/')[0]
    for i in range(SEFARIA_RETRIES):
        try:
            r = await state.http_client.post(url, json=payload, headers=_headers(), timeout=SEFARIA_TIMEOUT)
            if r.status_code >= 500:
                raise httpx.HTTPError(f"Server {r.status_code}")
            r.raise_for_status()
            metrics.record_tool_latency(f"sefaria_post_{metric_path}", (time.time() - start_time) * 1000)
            return r.json()
        except Exception as e:
            error_str = str(e)
            status = None
            if hasattr(e, 'response') and e.response:
                status = e.response.status_code
                error_str += f" (status: {status})"
            if i == SEFARIA_RETRIES - 1:
                logger.error(f"Sefaria POST failed: {url} payload={payload} err={error_str}")
                metrics.record_tool_error(f"sefaria_post_{metric_path}", error_str)
                return {"ok": False, "error": error_str, "_source": f"sefaria_post_{metric_path}"}
            await asyncio.sleep(0.5 * (2 ** i))

# --- Public async funcs used by tools ---

async def sefaria_get_text_v3_async(
    tref: str,
    version: str | None = None,          # "Russian" | "Russian|<Exact Title>" | "English"
    return_format: str = "text_only",    # text_only | default | strip_only_footnotes | wrap_all_entities
    fill_in_missing_segments: int = 0
) -> Dict[str, Any]:
    if not _looks_like_segment(tref):
        return {"ok": False, "error": "non-segment tref; use chapter/overview flow explicitly", "_source": "v3_guard"}

    params = {
        "return_format": return_format,
        "fill_in_missing_segments": str(fill_in_missing_segments)
    }
    if version:
        if version.strip().lower() == "all":
            return {"ok": False, "error": "version=all is forbidden", "_source": "v3_guard"}
        params["version"] = version

    encoded = quote(tref)
    data = await _get(f"v3/texts/{encoded}", params=params)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, dict):
        return {"ok": False, "error": "no response", "_source": "v3"}
    thin = thin_v3_response(data)
    thin = clamp_lines(thin, tref)
    if too_big(thin):
        return {"ok": False, "error": "text payload too large, refine request", "_source": "v3_thin"}
    return {"ok": True, "data": thin}

async def sefaria_list_commentators_async(tref: str) -> Dict[str, Any]:
    params = {"with_text": "0", "with_sheet_links": "0"}
    rows = await _get(f"links/{quote(tref)}", params=params)
    if not isinstance(rows, list):
        return {"ok": False, "error": "invalid links response", "_source": "commentators"}
    commentators = set()
    for r in rows:
        if r.get("category") == "Commentary":
            name = r.get("commentator") or r.get("collectiveTitle", {}).get("en")
            if name:
                commentators.add(name)
    return {"ok": True, "data": sorted(commentators)}

async def sefaria_get_text_v3_async(
    tref: str,
    version: str | None = None,          # "Russian" | "Russian|<Exact Title>" | "English"
    return_format: str = "text_only",    # text_only | default | strip_only_footnotes | wrap_all_entities
    fill_in_missing_segments: int = 0
) -> Dict[str, Any]:
    if not _looks_like_segment(tref):
        return {"ok": False, "error": "non-segment tref; use chapter/overview flow explicitly", "_source": "v3_guard"}

    params = {
        "return_format": return_format,
        "fill_in_missing_segments": str(fill_in_missing_segments)
    }
    if version:
        if version.strip().lower() == "all":
            return {"ok": False, "error": "version=all is forbidden", "_source": "v3_guard"}
        params["version"] = version

    encoded = quote(tref)
    data = await _get(f"v3/texts/{encoded}", params=params)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, dict):
        return {"ok": False, "error": "no response", "_source": "v3"}
    thin = thin_v3_response(data)
    thin = clamp_lines(thin, tref)
    if too_big(thin):
        return {"ok": False, "error": "text payload too large, refine request", "_source": "v3_thin"}
    return {"ok": True, "data": thin}

async def sefaria_list_commentators_async(tref: str) -> Dict[str, Any]:
    params = {"with_text": "0", "with_sheet_links": "0"}
    rows = await _get(f"links/{quote(tref)}", params=params)
    if not isinstance(rows, list):
        return {"ok": False, "error": "invalid links response", "_source": "commentators"}
    commentators = set()
    for r in rows:
        if r.get("category") == "Commentary":
            name = r.get("commentator") or r.get("collectiveTitle", {}).get("en")
            if name:
                commentators.add(name)
    return {"ok": True, "data": sorted(commentators)}

async def sefaria_get_links_async(ref: str, with_text: int = 0) -> Dict[str, Any]:
    """Gets links for a ref with a unified response format."""
    params = {"with_text": with_text, "with_sheet_links": 0}
    encoded_ref = quote(ref)
    data = await _get(f"links/{encoded_ref}", params=params)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not data:
        return {"ok": False, "error": "empty response"}
    if with_text == 0 and isinstance(data, list):
        slim = []
        for r in data:
            slim.append({
                "category": r.get("category"),
                "commentator": r.get("commentator") or r.get("collectiveTitle", {}).get("en"),
                "ref": r.get("ref"),
                "sourceRef": r.get("sourceRef"),
                "anchorRef": r.get("anchorRef"),
            })
        return {"ok": True, "data": slim}
    return {"ok": True, "data": data}

async def sefaria_search_async(query: str, filters=None, size: int = 5) -> Dict[str, Any]:
    """Performs a search with a unified response format. Keep size small."""
    payload = {"query": query, "type": "text", "size": size}
    if filters:
        payload["filters"] = filters
    data = await _post("search-wrapper", payload)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not data or not isinstance(data, dict):
        return {"ok": False, "error": "empty response"}
    if "results" in data and isinstance(data["results"], list):
        for hit in data["results"]:
            # Thin: remove heavy fields like 'he' and 'highlight'
            hit.pop("he", None)
            hit.pop("highlight", None)
            if "text" in hit:
                hit["text"] = hit["text"][:3]  # Limit to first 3 snippets
    if too_big(data):
        return {"ok": False, "error": "search payload too large", "_source": "search_thin"}
    return {"ok": True, "data": data}

async def sefaria_related_async(
    ref: str,
    include: Optional[Set[str]] = None,      # {"links","topics","sheets","webpages","manuscripts","media"}
    limits: Optional[Dict[str,int]] = None
) -> Dict[str, Any]:
    """Gets related content for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    raw = await _get(f"related/{encoded_ref}")
    if isinstance(raw, dict) and raw.get("error"):
        return raw
    if not isinstance(raw, dict):
        return {"ok": False, "error": "empty or invalid response"}

    include = include or {"links","topics"}  # по умолчанию узко
    limits = {**DEFAULT_LIMITS, **(limits or {})}
    thin: Dict[str, Any] = {}

    if "links" in include and isinstance(raw.get("links"), list):
        links = []
        for r in raw["links"]:
            links.append({
                "index_title": r.get("index_title"),
                "category": r.get("category"),
                "type": r.get("type"),
                "ref": r.get("ref"),
                "anchorRef": r.get("anchorRef"),
                "sourceRef": r.get("sourceRef"),
                "sourceHasEn": r.get("sourceHasEn"),
                "collectiveTitle": r.get("collectiveTitle", {}),
            })
        thin["links"] = links[:limits["links"]]

    if "topics" in include and isinstance(raw.get("topics"), list):
        thin["topics"] = [
            {"slug": t.get("topic"), "title": (t.get("title",{}) or {}).get("en") or (t.get("title",{}) or {}).get("he")}
            for t in raw["topics"][:limits["topics"]]
        ]

    if "sheets" in include and isinstance(raw.get("sheets"), list):
        thin["sheets"] = [
            {"id": s.get("id"), "title": s.get("title"), "sheetUrl": s.get("sheetUrl"), "ownerName": s.get("ownerName"), "views": s.get("views")}
            for s in raw["sheets"][:limits["sheets"]]
        ]

    if "webpages" in include and isinstance(raw.get("webpages"), list):
        thin["webpages"] = [
            {"title": w.get("title"), "url": w.get("url"), "siteName": w.get("siteName"), "description": w.get("description")}
            for w in raw["webpages"][:limits["webpages"]]
        ]

    if "manuscripts" in include and isinstance(raw.get("manuscripts"), list):
        thin["manuscripts"] = [
            {"image_url": m.get("image_url"), "thumbnail_url": m.get("thumbnail_url"), "anchorRef": m.get("anchorRef")}
            for m in raw["manuscripts"][:limits["manuscripts"]]
        ]

    if "media" in include and isinstance(raw.get("media"), list):
        thin["media"] = [
            {"media_url": m.get("media_url"), "source": m.get("source"), "description": m.get("description")}
            for m in raw["media"][:limits["media"]]
        ]

    if too_big(thin):
        return {"ok": False, "error": "related payload too large", "_source": "related_thin"}
    return {"ok": True, "data": thin}

async def sefaria_ref_topics_async(ref: str) -> Dict[str, Any]:
    """Gets topics for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    data = await _get(f"ref-topic-links/{encoded_ref}")
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, list):
        return {"ok": False, "error": "empty response"}
    thin = [
        {"slug": t.get("topic"), "title": (t.get("title", {}) or {}).get("en") or (t.get("title", {}) or {}).get("he")}
        for t in data[:20]
    ]
    if too_big({"data": thin}):
        return {"ok": False, "error": "topics payload too large", "_source": "topics_thin"}
    return {"ok": True, "data": thin}

async def sefaria_versions_async(index: str) -> Dict[str, Any]:
    """Gets versions for a book with a unified response format."""
    data = await _get(f"texts/versions/{index}")
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, dict):
        return {"ok": False, "error": "empty response"}
    # Thin versions to essential fields
    for lang in list(data.keys()):
        if isinstance(data[lang], list):
            data[lang] = [{"versionTitle": v.get("versionTitle"), "language": v.get("language")} for v in data[lang][:10]]
    if too_big(data):
        return {"ok": False, "error": "versions payload too large", "_source": "versions_thin"}
    return {"ok": True, "data": data}

async def sefaria_find_refs_async(query: str) -> Dict[str, Any]:
    """Finds refs in a string with a unified response format."""
    # Linker API (find-refs) is a POST request.
    # GET /api/linker is also available and could be tested in the future for more complex cases.
    payload = {"text": query}
    data = await _post("find-refs", payload)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_search_async(query: str, filters=None, size: int = 5) -> Dict[str, Any]:
    """Performs a search with a unified response format. Keep size small."""
    payload = {"query": query, "type": "text", "size": size}
    if filters:
        payload["filters"] = filters
    data = await _post("search-wrapper", payload)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not data or not isinstance(data, dict):
        return {"ok": False, "error": "empty response"}
    if "results" in data and isinstance(data["results"], list):
        for hit in data["results"]:
            # Thin: remove heavy fields like 'he' and 'highlight'
            hit.pop("he", None)
            hit.pop("highlight", None)
            if "text" in hit:
                hit["text"] = hit["text"][:3]  # Limit to first 3 snippets
    if too_big(data):
        return {"ok": False, "error": "search payload too large", "_source": "search_thin"}
    return {"ok": True, "data": data}

async def sefaria_related_async(
    ref: str,
    include: Optional[Set[str]] = None,      # {"links","topics","sheets","webpages","manuscripts","media"}
    limits: Optional[Dict[str,int]] = None
) -> Dict[str, Any]:
    """Gets related content for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    raw = await _get(f"related/{encoded_ref}")
    if isinstance(raw, dict) and raw.get("error"):
        return raw
    if not isinstance(raw, dict):
        return {"ok": False, "error": "empty or invalid response"}

    include = include or {"links","topics"}  # по умолчанию узко
    limits = {**DEFAULT_LIMITS, **(limits or {})}
    thin: Dict[str, Any] = {}

    if "links" in include and isinstance(raw.get("links"), list):
        links = []
        for r in raw["links"]:
            links.append({
                "index_title": r.get("index_title"),
                "category": r.get("category"),
                "type": r.get("type"),
                "ref": r.get("ref"),
                "anchorRef": r.get("anchorRef"),
                "sourceRef": r.get("sourceRef"),
                "sourceHasEn": r.get("sourceHasEn"),
                "collectiveTitle": r.get("collectiveTitle", {}),
            })
        thin["links"] = links[:limits["links"]]

    if "topics" in include and isinstance(raw.get("topics"), list):
        thin["topics"] = [
            {"slug": t.get("topic"), "title": (t.get("title",{}) or {}).get("en") or (t.get("title",{}) or {}).get("he")}
            for t in raw["topics"][:limits["topics"]]
        ]

    if "sheets" in include and isinstance(raw.get("sheets"), list):
        thin["sheets"] = [
            {"id": s.get("id"), "title": s.get("title"), "sheetUrl": s.get("sheetUrl"), "ownerName": s.get("ownerName"), "views": s.get("views")}
            for s in raw["sheets"][:limits["sheets"]]
        ]

    if "webpages" in include and isinstance(raw.get("webpages"), list):
        thin["webpages"] = [
            {"title": w.get("title"), "url": w.get("url"), "siteName": w.get("siteName"), "description": w.get("description")}
            for w in raw["webpages"][:limits["webpages"]]
        ]

    if "manuscripts" in include and isinstance(raw.get("manuscripts"), list):
        thin["manuscripts"] = [
            {"image_url": m.get("image_url"), "thumbnail_url": m.get("thumbnail_url"), "anchorRef": m.get("anchorRef")}
            for m in raw["manuscripts"][:limits["manuscripts"]]
        ]

    if "media" in include and isinstance(raw.get("media"), list):
        thin["media"] = [
            {"media_url": m.get("media_url"), "source": m.get("source"), "description": m.get("description")}
            for m in raw["media"][:limits["media"]]
        ]

    if too_big(thin):
        return {"ok": False, "error": "related payload too large", "_source": "related_thin"}
    return {"ok": True, "data": thin}

async def sefaria_ref_topics_async(ref: str) -> Dict[str, Any]:
    """Gets topics for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    data = await _get(f"ref-topic-links/{encoded_ref}")
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, list):
        return {"ok": False, "error": "empty response"}
    thin = [
        {"slug": t.get("topic"), "title": (t.get("title", {}) or {}).get("en") or (t.get("title", {}) or {}).get("he")}
        for t in data[:20]
    ]
    if too_big({"data": thin}):
        return {"ok": False, "error": "topics payload too large", "_source": "topics_thin"}
    return {"ok": True, "data": thin}

async def sefaria_versions_async(index: str) -> Dict[str, Any]:
    """Gets versions for a book with a unified response format."""
    data = await _get(f"texts/versions/{index}")
    if isinstance(data, dict) and data.get("error"):
        return data
    if not isinstance(data, dict):
        return {"ok": False, "error": "empty response"}
    # Thin versions to essential fields
    for lang in list(data.keys()):
        if isinstance(data[lang], list):
            data[lang] = [{"versionTitle": v.get("versionTitle"), "language": v.get("language")} for v in data[lang][:10]]
    if too_big(data):
        return {"ok": False, "error": "versions payload too large", "_source": "versions_thin"}
    return {"ok": True, "data": data}

async def sefaria_find_refs_async(query: str) -> Dict[str, Any]:
    """Finds refs in a string with a unified response format."""
    # Linker API (find-refs) is a POST request.
    # GET /api/linker is also available and could be tested in the future for more complex cases.
    payload = {"text": query}
    data = await _post("find-refs", payload)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}