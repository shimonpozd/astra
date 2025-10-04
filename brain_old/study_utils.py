# brain/study_utils.py
import logging
import re
from typing import Dict, Any, Optional, List, Tuple
import asyncio
from urllib.parse import quote

from .sefaria_client import sefaria_get_text_v3_async, sefaria_get_related_links_async
from .sefaria_index import get_book_structure, get_bookshelf_categories
from .sefaria_utils import CompactText, _get
from config import get_config_section

import logging_utils

logger = logging_utils.get_logger(__name__)

# --- Constants & Configuration ---
WINDOW_SIZE = 5
PREVIEW_MAX_LEN = 600

# --- Collection & Ref Parsing Logic ---

def detect_collection(ref: str) -> str:
    ref_lower = ref.lower()
    if ' on ' in ref_lower:
        return "Commentary"
    # This can be improved by using the categories from get_book_structure
    talmud_tractates = ['shabbat', 'berakhot', 'pesachim', 'ketubot', 'gittin', 'kiddushin', 'bava kamma', 'bava metzia', 'bava batra', 'sanhedrin', 'makkot']
    if any(tractate in ref_lower for tractate in talmud_tractates):
        return "Talmud"
    bible_books = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'samuel', 'kings', 'isaiah', 'jeremiah', 'ezekiel']
    if any(book in ref_lower for book in bible_books):
        return "Bible"
    if 'mishnah' in ref_lower:
        return "Mishnah"
    return "Unknown"

def _parse_ref(ref: str) -> Optional[Dict[str, Any]]:
    # Talmud
    match = re.match(r"([\w\s'.]+) (\d+)([ab])(?:[.:](\d+))?", ref)
    if match:
        return {"type": "talmud", "book": match.group(1).strip(), "page": int(match.group(2)), "amud": match.group(3), "segment": int(match.group(4)) if match.group(4) else 1}
    # Bible / Mishnah
    match = re.match(r"([\w\s'.]+) (\d+):(\d+)", ref)
    if match:
        return {"type": "bible", "book": match.group(1).strip(), "chapter": int(match.group(2)), "verse": int(match.group(3))}
    return None

# --- Navigation & Windowing Logic ---

async def _generate_and_validate_refs(base_ref: str, collection: str, direction: str, count: int) -> List[Dict[str, str]]:
    """Generates and validates a list of previous/next references with page/chapter transitions."""
    if not base_ref:
        return []

    parsed_ref = _parse_ref(base_ref)
    if not parsed_ref:
        return []

    book_structure = get_book_structure(parsed_ref['book'])
    
    generated_refs = []
    current_ref_parts = parsed_ref.copy()

    # Try up to e.g., 20 times to find `count` valid references
    for _ in range(count * 5):
        if len(generated_refs) >= count:
            break

        delta = 1 if direction == 'next' else -1
        candidate_ref_str = None
        
        # --- 1. Generate a candidate reference string ---
        if current_ref_parts['type'] == 'talmud':
            current_segment = current_ref_parts.get('segment', 1) or 1
            next_segment = current_segment + delta
            if next_segment > 0:
                candidate_ref_str = f"{current_ref_parts['book']} {current_ref_parts['page']}{current_ref_parts['amud']}.{next_segment}"
                current_ref_parts['segment'] = next_segment # Tentatively update
            # Backward page transition is too complex for now

        elif current_ref_parts['type'] == 'bible' and book_structure:
            chapter_index = current_ref_parts['chapter'] - 1
            new_verse = current_ref_parts['verse'] + delta

            if 1 <= new_verse <= book_structure['lengths'][chapter_index]:
                current_ref_parts['verse'] = new_verse
            elif new_verse > book_structure['lengths'][chapter_index] and direction == 'next':
                if chapter_index + 1 < len(book_structure['lengths']):
                    current_ref_parts['chapter'] += 1
                    current_ref_parts['verse'] = 1
            elif new_verse < 1 and direction == 'prev':
                if chapter_index > 0:
                    current_ref_parts['chapter'] -= 1
                    prev_chapter_verses = book_structure['lengths'][chapter_index - 1]
                    current_ref_parts['verse'] = prev_chapter_verses
            
            candidate_ref_str = f"{current_ref_parts['book']} {current_ref_parts['chapter']}:{current_ref_parts['verse']}"

        if not candidate_ref_str:
            break

        # --- 2. Validate the candidate ---
        text_result = await sefaria_get_text_v3_async(candidate_ref_str)
        if text_result.get("ok") and text_result.get("data"):
            generated_refs.append(text_result["data"])
        else:
            # Validation failed, if it's Talmud and we're going forward, try jumping page
            if current_ref_parts['type'] == 'talmud' and direction == 'next':
                if current_ref_parts['amud'] == 'a':
                    current_ref_parts['amud'] = 'b'
                    current_ref_parts['segment'] = 0 # Will be incremented to 1 at the start of the next loop
                else: # amud was 'b'
                    current_ref_parts['page'] += 1
                    current_ref_parts['amud'] = 'a'
                    current_ref_parts['segment'] = 0 # Will be incremented to 1
                continue # Retry loop with new page/amud settings
            else:
                # For other types or directions, stop if we hit a dead end
                break
    
    if direction == 'prev':
        generated_refs.reverse()

    return generated_refs

def containsHebrew(text: str) -> bool:
    if not text:
        return False
    # Unicode range for Hebrew characters
    for char in text:
        if '\u0590' <= char <= '\u05FF':
            return True
    return False

async def get_text_with_window(ref: str, window_size: int = WINDOW_SIZE) -> Optional[Dict[str, Any]]:
    # 1. Fetch focus segment
    focus_result = await sefaria_get_text_v3_async(ref)
    if not focus_result.get("ok") or not (focus_data := focus_result.get("data")):
        return None

    # 2. Fetch surrounding segments
    collection = detect_collection(ref)
    prev_refs_task = _generate_and_validate_refs(ref, collection, "prev", window_size)
    next_refs_task = _generate_and_validate_refs(ref, collection, "next", window_size)
    prev_segments, next_segments = await asyncio.gather(prev_refs_task, next_refs_task)

    # 3. Assemble the flat list of segments
    all_segments_data = prev_segments + [focus_data] + next_segments
    focus_index = len(prev_segments)

    # 4. Format segments for the frontend, renaming keys to match component props
    formatted_segments = []
    total_segments = len(all_segments_data)
    for i, seg_data in enumerate(all_segments_data):
        formatted_segments.append({
            "ref": seg_data.get("ref"),
            "text": seg_data.get("en_text") or "",      # Map en_text to text
            "heText": seg_data.get("he_text") or "",    # Map he_text to heText
            "position": (i / (total_segments - 1)) if total_segments > 1 else 0.5,
            "metadata": {
                "title": seg_data.get("title"),
                "indexTitle": seg_data.get("indexTitle"),
                "chapter": seg_data.get("chapter"), # Assuming these might exist
                "verse": seg_data.get("verse"),
            }
        })

    # 5. Return the structure expected by the frontend
    return {
        "segments": formatted_segments,
        "focusIndex": focus_index,
        "ref": ref,
    }

# --- Bookshelf Logic ---

def _get_commentator_priority(commentator: str, collection: str) -> int:
    base_priority = {"Rashi": 100, "Tosafot": 90, "Ramban": 80, "Ibn Ezra": 75, "Sforno": 70, "Shach": 85, "Taz": 85}.get(commentator, 50)
    if collection == "Talmud" and commentator in ["Rashi", "Tosafot"]: return base_priority + 20
    if collection == "Bible" and commentator in ["Rashi", "Ramban", "Ibn Ezra"]: return base_priority + 20
    return base_priority

async def get_bookshelf_for(ref: str, limit: int = 40, categories: Optional[List[str]] = None) -> Dict[str, Any]:
    collection = detect_collection(ref)
    
    # If categories aren't specified by the caller, use all categories
    if categories is None:
        categories = [cat['name'] for cat in get_bookshelf_categories()]

    # 1. Try the original ref
    links_result = await sefaria_get_related_links_async(ref=ref, categories=categories, limit=limit * 2)

    # 2. If no links, try raising the level by removing the last segment
    if not links_result.get("ok") or not links_result.get("data"):
        parent_ref = ":".join(ref.split(":")[:-1])
        if parent_ref and parent_ref != ref:
            logger.info(f"No links for '{ref}', trying parent '{parent_ref}'")
            links_result = await sefaria_get_related_links_async(ref=parent_ref, categories=categories, limit=limit * 2)

    if not links_result.get("ok") or not (items := links_result.get("data")):
        return {"counts": {}, "items": []}

    for item in items:
        item["score"] = _get_commentator_priority(item.get("commentator", ""), collection)
    
    sorted_items = sorted(items, key=lambda x: x.get("score", 0), reverse=True)

    preview_tasks = []
    for item in sorted_items[:20]: # Fetch full text for top 20
        async def fetch_full_text(item_ref):
            res = await sefaria_get_text_v3_async(item_ref)
            if res.get("ok") and res.get("data"):
                data = res["data"]
                en_text = data.get("en_text") or ""
                he_text = data.get("he_text") or ""
                return (en_text, he_text)
            return ("", "")
        preview_tasks.append(fetch_full_text(item["ref"]))

    full_texts = await asyncio.gather(*preview_tasks)
    for i, item in enumerate(sorted_items[:20]):
        en_text, he_text = full_texts[i]
        item["text_full"] = en_text
        item["heTextFull"] = he_text
        # For backward compatibility, populate preview with a snippet
        item["preview"] = (en_text or he_text)[:PREVIEW_MAX_LEN]

    # For items beyond 20, ensure the fields exist but are empty to satisfy the model
    for item in sorted_items[20:]:
        item["text_full"] = ""
        item["heTextFull"] = ""
        item["preview"] = ""

    counts = {cat: 0 for cat in {item.get("category", "Unknown") for item in sorted_items}}
    for item in sorted_items:
        counts[item.get("category", "Unknown")] += 1

    return {"counts": counts, "items": sorted_items[:limit]}
