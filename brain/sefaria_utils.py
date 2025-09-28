import re
import logging
from typing import Dict, Any, List, Tuple, Optional
import os
import httpx
import json
from dataclasses import dataclass

logger = logging.getLogger(__name__) 

SEFARIA_API_KEY = os.getenv("SEFARIA_API_KEY")
SEFARIA_API_URL = os.getenv("SEFARIA_API_URL_OVERRIDE", "http://localhost:8000/api/").rstrip('/')

async def _get(endpoint: str, params: dict | None = None) -> dict | list:
    async with httpx.AsyncClient() as client:
        url = f"{SEFARIA_API_URL}/{endpoint}"
        headers = {"Authorization": f"Bearer {SEFARIA_API_KEY}"} if SEFARIA_API_KEY else {}
        try:
            response = await client.get(url, params=params, headers=headers, timeout=20.0)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Sefaria API HTTP error for {url}: {e.response.status_code} {e.response.text}")
            return {"error": f"HTTP error: {e.response.status_code}", "details": e.response.text}
        except httpx.RequestError as e:
            logger.error(f"Sefaria API request error for {url}: {e}")
            return {"error": "Request error", "details": str(e)}

def clamp_lines(s: str, max_lines: int = 8) -> str:
    return "\n".join(s.splitlines()[:max_lines]).strip()

def _clean_html(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)

@dataclass
class CompactText:
    ref: str = ""
    heRef: str = ""
    title: str = ""
    indexTitle: str = ""
    type: str = ""
    lang: str = ""
    text: str = ""

    def __init__(self, raw: dict, preferred_langs: Tuple[str, ...] = ('en', 'he')):
        if not isinstance(raw, dict):
            logger.warning("CompactText received non-dict raw data, initializing empty.")
            return
        self.ref = raw.get("ref", "")
        self.heRef = raw.get("heRef", "")
        self.title = raw.get("title", "")
        self.indexTitle = raw.get("indexTitle", "")
        self.type = raw.get("type", "")
        
        # Try to get text directly if no versions field or versions is empty
        direct_text = raw.get("text")
        if direct_text and (not raw.get("versions") or not raw.get("versions", [])):
            self.lang = raw.get("lang", preferred_langs[0] if preferred_langs else "")
            if isinstance(direct_text, list):
                processed_text = "\n".join(map(str, direct_text))
            else:
                processed_text = str(direct_text)
            self.text = clamp_lines(_clean_html(processed_text).strip(), max_lines=8)
            return # Exit early if direct text found

        chosen_version = None
        for lang in preferred_langs:
            for v in raw.get("versions", []):
                if v.get("language") == lang and v.get("text"):
                    chosen_version = v
                    break
            if chosen_version:
                break
        if not chosen_version:
            chosen_version = next((v for v in raw.get("versions", []) if v.get("text")), None)
        if chosen_version:
            self.lang = chosen_version.get("language", "")
            raw_text = chosen_version.get("text", "")
            if isinstance(raw_text, list):
                processed_text = "\n".join(map(str, raw_text))
            else:
                processed_text = str(raw_text)
            cleaned_text = _clean_html(processed_text).strip()
            self.text = clamp_lines(cleaned_text, max_lines=8)
        else:
            self.lang = preferred_langs[0] if preferred_langs else ""
            self.text = ""

    def text_empty(self) -> bool:
        return not self.text.strip()

    def to_dict_min(self) -> Dict[str, str]:
        return {
            "ref": self.ref,
            "heRef": self.heRef,
            "title": self.title,
            "indexTitle": self.indexTitle,
            "type": self.type,
            "lang": self.lang,
            "text": self.text,
        }

def compact_and_deduplicate_links(raw_links: list, categories: Optional[List[str]], limit: int = 150) -> List[Dict[str, Any]]:
    if not isinstance(raw_links, list):
        return []

    filtered = []
    seen_dedup_keys = set()

    for link in raw_links:
        link_category = link.get("category")
        # If categories are specified, filter by them
        if categories and link_category not in categories:
            continue

        # Be more lenient in finding the commentator/source name
        commentator = link.get("commentator") or \
                      (link.get("collectiveTitle", {}).get("en")) or \
                      link.get("indexTitle")
        
        if not commentator:
            # As a last resort, try to build it from the ref
            ref_parts = link.get("ref", "").split(" on ")
            if len(ref_parts) > 1:
                commentator = ref_parts[0]
            else:
                continue # Skip if we truly can't identify the source

        ref = link.get("ref")
        if not ref:
            continue

        # Use a more robust deduplication key
        dedup_key = (commentator, ref)
        if dedup_key in seen_dedup_keys:
            continue
        seen_dedup_keys.add(dedup_key)

        filtered.append({
            "ref": ref,
            "heRef": link.get("heRef"),
            "commentator": commentator, # FIX: Use the 'commentator' key for the name
            "indexTitle": link.get("indexTitle", commentator), # Keep indexTitle for consistency
            "category": link_category,
            "heCategory": link.get("heCategory"),
            "commentaryNum": link.get("commentaryNum") # FIX: Add the commentary number back
        })

    # A simpler sort by category might be better.
    def sort_key(link):
        category_order = {"Commentary": 0, "Midrash": 1, "Halakhah": 2, "Targum": 3}
        cat = link.get("category", "Unknown")
        return (category_order.get(cat, 99), link.get("indexTitle", ""))

    try:
        filtered.sort(key=sort_key)
    except Exception as e:
        logger.error(f"Failed to sort links: {e}")

    return filtered[:limit]