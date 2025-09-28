# D:\AI\astra\brain\sefaria_client.py
import os
import time
import json
import asyncio
import re
from typing import Any, Dict, Optional

from urllib.parse import urlencode, quote

from .state import state
from .metrics import metrics
import httpx
import logging

logger = logging.getLogger("sefaria")

SEFARIA_BASE = os.getenv("SEFARIA_BASE_URL", "https://www.sefaria.org/api").rstrip("/")
SEFARIA_TIMEOUT = float(os.getenv("SEFARIA_TIMEOUT_SECONDS", "15"))
SEFARIA_RETRIES = int(os.getenv("SEFARIA_RETRIES", "3"))
PREFERRED_LANG = os.getenv("SEFARIA_PREFERRED_LANG", "ru")
FALLBACK_LANG = os.getenv("SEFARIA_FALLBACK_LANG", "en")
CACHE_TTL = int(os.getenv("SEFARIA_CACHE_TTL_SECONDS", "3600"))
MAX_BYTES = 120_000
MAX_LINES = 40

_TANAKH_SEGMENT_RE = re.compile(r"^[A-Za-z][A-Za-z ':-]*\s+\d+:\d+(\-\d+)?$")  # Daniel 3:15
_TALMUD_PAGE_RE   = re.compile(r"^[A-Za-z][A-Za-z ':-]*\s+\d+[ab]$")           # Berakhot 2a

_cache = {}
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

def clamp_lines(thin: Dict[str, Any]) -> Dict[str, Any]:
    text = thin.get("text", [])
    if isinstance(text, list) and len(text) > MAX_LINES:
        thin["text"] = text[:MAX_LINES]
        thin["_note"] = f"clamped to {MAX_LINES} lines"
    return thin

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
    
    cache_key = f"{path}?{urlencode(params)}" if params else path
    async with _cache_lock:
        if cache_key in _cache:
            data, expiry = _cache[cache_key]
            if time.time() < expiry:
                return data

    url = f"{SEFARIA_BASE}/{path.lstrip('/')}"
    start_time = time.time()
    metric_path = path.split('/')[0]
    for i in range(SEFARIA_RETRIES):
        try:
            r = await state.http_client.get(url, params=params, headers=_headers(), timeout=SEFARIA_TIMEOUT)
            if r.status_code >= 500:
                raise httpx.HTTPError(f"Server {r.status_code}")
            r.raise_for_status()
            
            data = r.json()
            async with _cache_lock:
                _cache[cache_key] = (data, time.time() + CACHE_TTL)

            metrics.record_tool_latency(f"sefaria_get_{metric_path}", (time.time() - start_time) * 1000)
            return data
        except Exception as e:
            if i == SEFARIA_RETRIES - 1:
                logger.error(f"Sefaria GET failed: {url} params={params} err={e}")
                metrics.record_tool_error(f"sefaria_get_{metric_path}", str(e))
                return {"ok": False, "error": str(e), "_source": f"sefaria_get_{metric_path}"}
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
            if i == SEFARIA_RETRIES - 1:
                logger.error(f"Sefaria POST failed: {url} payload={payload} err={e}")
                metrics.record_tool_error(f"sefaria_post_{metric_path}", str(e))
                return {"ok": False, "error": str(e), "_source": f"sefaria_post_{metric_path}"}
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
    if not isinstance(data, dict):
        return {"ok": False, "error": "no response", "_source": "v3"}
    if data.get("error"):
        return {"ok": False, "error": data["error"], "_source": "v3"}
    return {"ok": True, "data": data}

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

async def sefaria_get_links_async(ref: str, with_text: int = 1) -> Dict[str, Any]:
    """Gets links for a ref with a unified response format."""
    params = {"with_text": with_text}
    encoded_ref = quote(ref)
    data = await _get(f"links/{encoded_ref}", params=params)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_search_async(query: str, filters=None, size: int = 5) -> Dict[str, Any]:
    """Performs a search with a unified response format. Keep size small."""
    payload = {"query": query, "type": "text", "size": size}
    if filters:
        payload["filters"] = filters
    data = await _post("search-wrapper", payload)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_related_async(ref: str) -> Dict[str, Any]:
    """Gets related content for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    data = await _get(f"related/{encoded_ref}")
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_ref_topics_async(ref: str) -> Dict[str, Any]:
    """Gets topics for a ref. Use with caution, can be a heavy call."""
    encoded_ref = quote(ref)
    data = await _get(f"ref-topic-links/{encoded_ref}")
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_versions_async(index: str) -> Dict[str, Any]:
    """Gets versions for a book with a unified response format."""
    data = await _get(f"texts/versions/{index}")
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}

async def sefaria_find_refs_async(query: str) -> Dict[str, Any]:
    """Finds refs in a string with a unified response format."""
    # Linker API (find-refs) is a POST request.
    # GET /api/linker is also available and could be tested in the future for more complex cases.
    payload = {"text": query}
    data = await _post("find-refs", payload)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}