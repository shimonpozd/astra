# D:\AI\astra\brain\sefaria_client.py
import os
import time
import json
import asyncio
import re
from typing import Any, Dict, Optional, Set, Tuple, List
import unicodedata
import difflib

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
COMMENTATOR_ALIASES = {
    # Abravanel
    "abrananel": "abravanel",
    "abarbanel": "abravanel",
    "abrabanel": "abravanel",
    "абрабаевель": "abravanel",
    "абрабанель": "abravanel",
    "абарбанель": "abravanel",
    # Rashi
    "rashi": "rashi", "раши": "rashi",
    # Ibn Ezra
    "ibn ezra": "ibn ezra", "ибн эзра": "ibn ezra",
    # Malbim
    "malbim": "malbim", "малбим": "malbim",
    # Sforno
    "sforno": "sforno", "сфорно": "sforno",
    # Hizkuni
    "hizkuni": "hizkuni", "хизкуни": "hizkuni",
    # Kli Yakar
    "kli yakar": "kli yakar", "кли якар": "kli yakar",
}

# Stop words to remove from names
STOP_WORDS = {
    "on", "perush", "commentary", "ikar", "english", "explanation", "of", "mishnah",
    "tractate", "sefer", "al", "lel", "part", "volume"
}

# Cyrillic to Latin transliteration map (partial)
CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "tz",
    "ч": "ch", "ш": "sh", "щ": "shch", "ы": "y", "э": "e", "ю": "yu", "я": "ya"
}

def remove_nikud(text: str) -> str:
    """Remove Hebrew nikud (diacritics) from text."""
    return "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")

def normalize_hebrew_final_letters(text: str) -> str:
    """Normalize Hebrew final letters to standard form."""
    final_map = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}
    return "".join(final_map.get(ch, ch) for ch in text)

def transliterate_cyrillic(text: str) -> str:
    """Transliterate Cyrillic characters to Latin approximations."""
    return "".join(CYRILLIC_TO_LATIN.get(ch, ch) for ch in text.lower())

def clean_name(s: str) -> str:
    """Lowercase, remove punctuation, diacritics, multiple spaces."""
    s = s.lower()
    s = remove_nikud(s)
    s = normalize_hebrew_final_letters(s)
    s = transliterate_cyrillic(s)
    s = re.sub(r"[^\w\s]", "", s)  # Remove punctuation
    s = re.sub(r"\s+", " ", s)  # Normalize spaces
    tokens = s.strip().split()
    tokens = [t for t in tokens if t not in STOP_WORDS]
    tokens.sort()
    return " ".join(tokens)

def name_normalize(s: str) -> Tuple[str, Set[str]]:
    """Return canonical string and set of tokens for a name."""
    canon = clean_name(s)
    tokens = set(canon.split())
    return canon, tokens

def best_match(user_query: str, candidates: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Match user_query against candidates.
    Returns (best_match or None, top_3_candidates).
    """
    # Transliterate Cyrillic input to Latin for better matching
    def transliterate_input(s: str) -> str:
        CYRILLIC_TO_LATIN = {
            "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
            "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
            "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "tz",
            "ч": "ch", "ш": "sh", "щ": "shch", "ы": "y", "э": "e", "ю": "yu", "я": "ya"
        }
        return "".join(CYRILLIC_TO_LATIN.get(ch, ch) for ch in s.lower())

    user_query = transliterate_input(user_query)
    user_canon, user_tokens = name_normalize(user_query)

    def score_candidate(cand: Dict[str, Any]) -> float:
        names_to_check = []
        if "display" in cand:
            names_to_check.append(cand["display"])
        if "he" in cand:
            # Give higher priority to Hebrew name
            names_to_check.insert(0, cand["he"])
        if "en" in cand:
            names_to_check.append(cand["en"])
        max_score = 0.0
        for name in names_to_check:
            if not name:
                continue
            cand_canon, cand_tokens = name_normalize(name)
            if user_canon == cand_canon:
                return 1.0
            if user_tokens.issubset(cand_tokens) or cand_tokens.issubset(user_tokens):
                max_score = max(max_score, 0.95)
            elif user_canon in cand_canon or cand_canon in user_canon:
                max_score = max(max_score, 0.90)
            else:
                fuzzy = difflib.SequenceMatcher(None, user_canon, cand_canon).ratio()
                jaccard = len(user_tokens.intersection(cand_tokens)) / max(1, len(user_tokens.union(cand_tokens)))
                combined = 0.6 * fuzzy + 0.4 * jaccard
                max_score = max(max_score, combined)
        return max_score

    scored = [(score_candidate(c), c) for c in candidates]
    scored.sort(key=lambda x: x[0], reverse=True)
    top_score, top_candidate = scored[0] if scored else (0.0, None)
    top_3 = [c for _, c in scored[:3]]

    if top_score < 0.65:
        return None, top_3
    return top_candidate, top_3

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
    #if not _looks_like_segment(tref):
    #    return {"ok": False, "error": "non-segment tref; use chapter/overview flow explicitly", "_source": "v3_guard"}

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
    return {"ok": True, "requested_version": version, "data": thin}

async def sefaria_list_commentators_async(tref: str) -> Dict[str, Any]:
    params = {"with_text": 0, "with_sheet_links": 0}
    rows = await _get(f"links/{quote(tref)}", params=params)
    if not isinstance(rows, list):
        return {"ok": False, "error": "invalid links response", "_source": "commentators"}

    items = []
    for r in rows:
        if r.get("category") != "Commentary":
            continue
        
        commentator_name = (r.get("commentator") or r.get("collectiveTitle", {}).get("en") or r.get("collectiveTitle", {}).get("he") or "Unknown").strip()
        ref = r.get("ref")

        if not ref:
            continue

        items.append({
            "commentator": commentator_name,
            "ref": ref
        })
        if len(items) >= 50:
            break

    return {"ok": True, "data": items}



async def sefaria_get_links_async(ref: str) -> Dict[str, Any]:
    """Gets links for a ref with a unified response format."""
    params = {"with_text": 0, "with_sheet_links": 0}  # Force with_text=0 to reduce payload size
    encoded_ref = quote(ref)
    data = await _get(f"links/{encoded_ref}", params=params)
    if isinstance(data, dict) and data.get("error"):
        return data
    if not data:
        return {"ok": False, "error": "empty response"}
    if isinstance(data, list):
        slim = []
        for r in data:
            slim.append({
                "category": r.get("category"),
                "commentator": r.get("commentator") or r.get("collectiveTitle", {}).get("en"),
                "ref": r.get("ref"),
                "sourceRef": r.get("sourceRef"),
                "anchorRef": r.get("anchorRef"),
            })
        return {"ok": True, "data": slim[:50]}  # Safety cap to 50 links
    return {"ok": False, "error": "invalid links response"}

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



async def sefaria_find_refs_async(query: str) -> Dict[str, Any]:
    """Finds refs in a string with a unified response format."""
    # Linker API (find-refs) is a POST request.
    # GET /api/linker is also available and could be tested in the future for more complex cases.
    payload = {"text": query}
    data = await _post("find-refs", payload)
    if data:
        return {"ok": True, "data": data}
    return {"ok": False, "error": "empty response"}





def compact_for_llm(tool_name: str, payload: dict, max_list=50) -> dict:
    # уже компактные — просто лимитируем списки
    if tool_name in {"sefaria_get_links", "sefaria_list_commentators"}:
        if payload.get("ok") and isinstance(payload.get("data"), list):
            data = payload["data"][:max_list]
            return {"ok": True, "data": data}
        return payload

    # related / topics — у вас и так тонкие; просто страхуемся
    if tool_name in {"sefaria_related", "sefaria_ref_topics"}:
        return payload  # они уже проходят through too_big в клиенте

    # v3-тексты и остальное — доверяем клиенту (он уже сушит)
    return payload

TURN_BUDGET_BYTES = 110_000  # Reduced budget to limit token usage and avoid rate limits

def size_of(obj) -> int:
    try:
        return len(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return 999_999

def check_turn_budget(used_bytes: int, new_payload: dict, tool_name: str = "generic") -> tuple[bool, dict, int]:
    """
    Check if adding new_payload would exceed budget.
    Returns (ok: bool, safe_payload: dict, new_used_bytes: int)
    """
    safe = compact_for_llm(tool_name, new_payload)
    sz = size_of(safe)
    if used_bytes + sz > TURN_BUDGET_BYTES:
        error_payload = {"ok": False, "error": "turn budget exceeded, please narrow the request"}
        return False, error_payload, used_bytes
    return True, safe, used_bytes + sz

# Simple LRU cache for aliases
_alias_cache: OrderedDict[Tuple[str, str], str] = OrderedDict()
_ALIAS_CACHE_MAX_SIZE = 1000
_ALIAS_CACHE_NEGATIVE_TTL = 900  # 15 minutes negative cache in seconds



async def sefaria_get_segment_bilingual(tref: str) -> Dict[str, Any]:
    """Get bilingual segment: Hebrew source + optional translation (Russian preferred, fallback to English)."""
    # Hebrew source (mandatory)
    he_res = await sefaria_get_text_v3_async(tref, version="source")
    he_text = he_res["data"]["text"] if he_res.get("ok") else []

    # Translation: Russian first, fallback to English
    tr_res = await sefaria_get_text_v3_async(tref, version="Russian")
    tr_lang = "ru"
    tr_text = tr_res["data"]["text"] if tr_res.get("ok") else []
    if not tr_text:
        tr_res = await sefaria_get_text_v3_async(tref, version="English")
        tr_lang = "en"
        tr_text = tr_res["data"]["text"] if tr_res.get("ok") else []

    data = {
        "ref": he_res.get("data", {}).get("ref") or tref,
        "he": he_text,
        "tr": tr_text if tr_text else [],
        "lang_tr": tr_lang if tr_text else None,
        "next": he_res.get("data", {}).get("next"),
        "prev": he_res.get("data", {}).get("prev"),
    }

    if too_big(data):
        return {"ok": False, "error": "bilingual payload too large", "_source": "bilingual_thin"}

    return {"ok": True, "data": data}
