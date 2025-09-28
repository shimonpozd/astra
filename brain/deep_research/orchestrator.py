import asyncio
import json
import re
import logging
import random
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from ..chunker import Chunk, chunk_text
from ..llm_config import get_llm_for_task, LLMConfigError, get_reasoning_params
from ..memory_client import store_chunks_in_memory
from ..sefaria_client import (
    normalize_tref,
    sefaria_get_related_links_async,
    sefaria_get_text_v3_async,
)
from .dialogue_system import generate_internal_questions, critique_draft
from config.prompts import get_prompt

from ..state import state

TORAH_CATEGORY_OPTIONS = [
    "Commentary", "Quoting Commentary", "Midrash", "Mishnah", "Targum",
    "Halakhah", "Responsa", "Chasidut", "Kabbalah", "Jewish Thought",
    "Liturgy", "Bible", "Apocrypha", "Modern Works",
]

# A palette of visually distinct colors
COLOR_PALETTE = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b",
    "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#aec7e8", "#ffbb78",
    "#98df8a", "#ff9896"
]

CATEGORY_COLOR_MAP = {
    category: COLOR_PALETTE[i % len(COLOR_PALETTE)]
    for i, category in enumerate(TORAH_CATEGORY_OPTIONS)
}
DEFAULT_SOURCE_COLOR = "#6c757d" # A neutral default color


def _slugify(value: str) -> str:
    filtered = ''.join(ch.lower() if ch.isalnum() else '_' for ch in value)
    parts = [p for p in filtered.split('_') if p]
    return '_'.join(parts) or 'study'

def generate_collection_name(base: str, session_id: str, reference: str | None, prompt: str | None) -> str:
    source = reference or prompt or ''
    slug = _slugify(source)[:48]
    session_slug = session_id.split('-')[0]
    base_name = f"{base}_session_{session_slug}_{slug}" if slug else f"{base}_session_{session_slug}"
    return base_name


def _create_source_event_payload(text_data: Dict[str, Any]) -> Dict[str, Any]:
    """Formats the text data from Sefaria into the structured source event."""
    ref = text_data.get("ref", "")
    category = text_data.get("type")
    
    # Attempt to parse author from ref
    author = text_data.get("indexTitle", "Unknown") # Default to indexTitle
    if " on " in ref:
        author = ref.split(" on ")[0]

    # New color logic based on category
    color = CATEGORY_COLOR_MAP.get(category, DEFAULT_SOURCE_COLOR)

    return {
        "type": "source",
        "data": {
            "id": f"source-{uuid.uuid4()}",
            "author": author,
            "book": text_data.get("indexTitle", "Unknown"),
            "reference": ref,
            "text": text_data.get("text", ""),
            "url": f"https://www.sefaria.org/{ref.replace(' ', '_')}",
            "ui_color": color,
            "lang": text_data.get("lang", "en"),
            "heRef": text_data.get("heRef", "")
        }
    }


async def prepare_deepresearch_payload(
    *,
    prompt: str,
    user_id: str,
    session_id: str,
    agent_id: str,
    collection_base: str,
    memory_service_url: str,
    per_study_collection: bool = False,
    plan: Optional[Dict[str, Any]] = None,
    seen_refs: Optional[Set[str]] = None,
    stream_event_callback: Optional[callable] = None
) -> Tuple[Dict[str, Any], Set[str], Optional[str]]:
    logger.info("Starting deep research payload preparation", extra={"event": "payload_prep_started"})
    processed_refs: Set[str] = set()
    current_seen_refs = seen_refs or set()
    note_collection_name: Optional[str] = None

    research_info: Dict[str, Any] = {
        "prompt": prompt, "collection": collection_base, "chunks_stored": 0,
        "memory_status": "skipped", "sources": [], "commentaries": [],
    }
    if plan: research_info["plan"] = plan

    if not plan or not plan.get("primary_ref"):
        logger.warning("No primary_ref in plan, cannot proceed.", extra={"event": "payload_prep_skipped", "reason": "no_primary_ref"})
        research_info["memory_status"] = "skipped"
        research_info["skip_reason"] = "no_primary_ref"
        return research_info, processed_refs, note_collection_name

    primary_ref = plan["primary_ref"]
    logger.info(f"Processing primary reference: {primary_ref}", extra={"event": "primary_ref_processing", "ref": primary_ref, "seen_refs_count": len(current_seen_refs)})
    
    combined_chunks: List[Chunk] = []
    chunk_metadatas: List[Dict[str, Any]] = []
    note_chunks: List[Chunk] = []
    note_metadatas: List[Dict[str, Any]] = []

    if primary_ref not in current_seen_refs:
        processed_refs.add(primary_ref)
        try:
            text_payload = await sefaria_get_text_v3_async(primary_ref)
        except Exception as e:
            logger.error(f"Sefaria API call failed for primary_ref: {primary_ref}", extra={"event": "sefaria_api_error", "ref": primary_ref, "error": str(e)})
            return research_info, processed_refs, note_collection_name
        
        if text_payload.get("ok") and (text_data := text_payload.get("data")):
            if stream_event_callback:
                logger.info(f"📖 Streaming source event for primary ref {primary_ref}")
                event_payload = _create_source_event_payload(text_data)
                await stream_event_callback(event_payload)
            base_text = text_data.get("text")
            logger.info(f"Processing {len(base_text)} chars from primary text", extra={"event": "primary_text_processing", "ref": primary_ref, "char_count": len(base_text)})
            for chunk in chunk_text(base_text):
                position = len(combined_chunks)
                combined_chunks.append(Chunk(text=chunk.text, index=position))
                chunk_metadatas.append({"collection_layer": "raw", "source": "primary", "source_ref": primary_ref, "chunk_index": position})
                if structured_note := await _summarize_note_text(chunk.text, ref=primary_ref, role="primary", stream_event_callback=stream_event_callback):
                    note_chunks.append(Chunk(text=json.dumps(structured_note, ensure_ascii=False), index=len(note_chunks)))
                    note_metadatas.append({"collection_layer": "notes", "note_type": structured_note.get("type", "note"), "source_ref": primary_ref, "original_chunk_index": position, "keywords": ",".join(structured_note.get("keywords", []))})

    route = plan.get("categories", [])
    logger.info(f"Executing research route", extra={"event": "route_execution_started", "route": route})
    max_commentaries = plan.get("commentary_preferences", {}).get("max_per_category", 6)
    priority_commentators = plan.get("commentary_preferences", {}).get("priority_commentators", [])

    processed_categories = set()
    while True:
        categories_to_process = [cat for cat in route if cat not in processed_categories]
        if not categories_to_process: break

        for category in categories_to_process:
            logger.info(f"Fetching commentaries for category: '{category}'", extra={"event": "category_fetch_started", "category": category})
            processed_categories.add(category)
            try:
                links_result = await sefaria_get_related_links_async(primary_ref, categories=[category])
            except Exception as e:
                logger.error(f"Sefaria API call failed for related links", extra={"event": "sefaria_api_error", "ref": primary_ref, "category": category, "error": str(e)})
                continue
            
            if not links_result.get("ok"): continue
            links = links_result.get("data") or []
            logger.info(f"Found {len(links)} links", extra={"event": "links_found", "category": category, "count": len(links)})
            
            curated_links = await curate_links_with_llm(origin_ref=primary_ref, links=links, allowed_categories=[category], limit=max_commentaries * 2, priority_commentators=priority_commentators, plan_context=plan, seen_refs=current_seen_refs)
            selected_links = curated_links or select_priority_links(links, [category], max_commentaries * 2, priority_commentators, session_seen_refs=current_seen_refs)
            logger.info(f"Curated to {len(selected_links)} links", extra={"event": "links_curated", "category": category, "count": len(selected_links)})

            validated_count = 0
            if selected_links:
                for i, link in enumerate(selected_links):
                    if validated_count >= max_commentaries: break
                    commentary_ref = link.get("ref")
                    if not commentary_ref or commentary_ref in current_seen_refs: continue

                    try:
                        text_payload = await sefaria_get_text_v3_async(commentary_ref)
                        if text_payload.get("ok") and (text_data := text_payload.get("data")):
                            if stream_event_callback:
                                logger.info(f"📖 Streaming source event for commentary {commentary_ref}")
                                event_payload = _create_source_event_payload(text_data)
                                await stream_event_callback(event_payload)
                            commentary_text = text_data.get("text")
                            logger.debug(f"Link validation successful: {commentary_ref}", extra={"event": "link_validation", "status": "success", "ref": commentary_ref})
                            validated_count += 1
                            processed_refs.add(commentary_ref)
                            current_seen_refs.add(commentary_ref)
                            for chunk in chunk_text(commentary_text):
                                position = len(combined_chunks)
                                combined_chunks.append(Chunk(text=chunk.text, index=position))
                                chunk_metadatas.append({"collection_layer": "raw", "source": "commentary", "source_ref": commentary_ref, "category": category, "chunk_index": position})
                                if structured_note := await _summarize_note_text(chunk.text, ref=commentary_ref, role="commentary", stream_event_callback=stream_event_callback):
                                    note_chunks.append(Chunk(text=json.dumps(structured_note, ensure_ascii=False), index=len(note_chunks)))
                                    note_metadatas.append({"collection_layer": "notes", "note_type": structured_note.get("type", "note"), "source_ref": commentary_ref, "original_chunk_index": position, "keywords": ",".join(structured_note.get("keywords", []))})
                        else:
                            logger.warning(f"Link validation failed (empty text): {commentary_ref}", extra={"event": "link_validation", "status": "failure", "ref": commentary_ref})
                    except Exception as e:
                        logger.error(f"Exception during link validation for {commentary_ref}", extra={"event": "link_validation_error", "ref": commentary_ref, "error": str(e)})

        if not combined_chunks and "Commentary" in processed_categories:
            logger.warning("No valid commentaries found, expanding route", extra={"event": "route_expansion"})
            if "Talmud" not in route: route.append("Talmud")
            if "Halakhah" not in route: route.append("Halakhah")
        else:
            break

    collection_slug = generate_collection_name(collection_base, session_id, primary_ref, prompt)
    raw_collection_name = f"{collection_slug}_raw"
    note_collection_name = f"{collection_slug}_notes"

    logger.info(f"Storing {len(combined_chunks)} raw chunks and {len(note_chunks)} notes", extra= {
        "event": "data_storage", "raw_chunk_count": len(combined_chunks), "note_chunk_count": len(note_chunks),
        "raw_collection": raw_collection_name, "note_collection": note_collection_name
    })
    if combined_chunks:
        await store_chunks_in_memory(base_url=memory_service_url, collection=raw_collection_name, user_id=user_id, session_id=session_id, agent_id=agent_id, chunks=combined_chunks, chunk_metadata=chunk_metadatas)
    if note_chunks:
        await store_chunks_in_memory(base_url=memory_service_url, collection=note_collection_name, user_id=user_id, session_id=session_id, agent_id=agent_id, chunks=note_chunks, chunk_metadata=note_metadatas)

    research_info.update({
        "chunks_stored": len(combined_chunks), "memory_status": "success" if combined_chunks else "skipped",
        "collection": raw_collection_name, "note_collection": note_collection_name,
        "sources": _build_source_entries(prompt, plan),
        "primary_summary": [{"ref": plan.get("primary_ref"), "chunks": len([m for m in chunk_metadatas if m.get("source")=="primary"])}]
    })
    
    cat_counts = defaultdict(int)
    commentators = defaultdict(set)
    for md in chunk_metadatas:
        if md.get("source") == "commentary":
            cat = md.get("category") or "Commentary"
            cat_counts[cat] += 1
            commentators[cat].add(md.get("source_ref","").split(" on ")[0])
    research_info["commentary_summary"] = {cat: {"count": cat_counts[cat], "commentators": sorted(list(commentators.get(cat, [])))[:6]} for cat in cat_counts}

    logger.info("Finished deep research payload preparation", extra={"event": "payload_prep_finished", "chunks_stored": research_info["chunks_stored"]})
    return research_info, processed_refs, note_collection_name, note_chunks

async def _try_fetch_research_preview(*, memory_service_url: str, user_id: str, session_id: str, collection: str, limit: int = 24) -> Optional[Dict[str, Any]]:
    if not memory_service_url: return None
    client = state.http_client or httpx.AsyncClient()
    state.http_client = client
    url = f"{memory_service_url.rstrip('/')}/research/recall"
    payload = {"user_id": user_id, "session_id": session_id, "collection": collection, "limit": limit}
    logger.debug(f"Sending payload to /research/recall", extra={"event": "fetch_preview", "payload": payload})
    try:
        response = await client.post(url, json=payload, timeout=8.0)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to fetch research preview. Status: {response.status_code}", extra={"event": "fetch_preview_failed", "status": response.status_code, "response": response.text})
            return {"error": response.text, "status_code": response.status_code}
    except Exception as exc:
        logger.error("Exception in _try_fetch_research_preview", extra={"event": "fetch_preview_exception", "error": str(exc)})
        return None

def _build_source_entries(prompt: str, plan: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    if not plan: return []
    primary_items = plan.get("primary_refs", [])
    if not primary_items and plan.get("primary_ref"): primary_items = [plan["primary_ref"]]
    for item in primary_items:
        entries.append({"role": "primary", "ref": str(item), "categories": plan.get("categories", [])})
    for item in plan.get("supporting_refs", []):
        entries.append({"role": "supporting", "ref": str(item), "categories": []})
    return entries

async def _summarize_note_text(text: Optional[str], *, ref: str, role: str, title: Optional[str] = None, commentator: Optional[str] = None, stream_event_callback: Optional[callable] = None) -> Optional[Dict[str, Any]]:
    if not text or not text.strip(): return None
    logger.debug(f"Asking SUMMARIZER to create note for chunk from {ref}", extra={"event": "summarizer_started", "ref": ref})
    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("SUMMARIZER")
    except LLMConfigError as e:
        logger.warning("Could not get LLM for summarizer, skipping note generation", extra={"event": "llm_config_error", "task": "SUMMARIZER", "error": str(e)})
        return None

    user_prompt = f"Reference: {ref}\nRole: {role}{f' by {commentator}' if commentator else ''}\n\nText to analyze:\n{text.strip()}"
    try:
        note_system_prompt = get_prompt("deep_research.note_system")
        if not note_system_prompt:
            logger.error("deep_research.note_system prompt not found or failed to load.")
            return None

        api_params = {"model": model, "messages": [{"role": "system", "content": note_system_prompt}, {"role": "user", "content": user_prompt}], **reasoning_params}
        if "json_mode" in capabilities: api_params["response_format"] = {"type": "json_object"}
        response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        content = (response.choices[0].message.content or "").strip()
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match: 
            logger.warning("Note generation did not return valid JSON", extra={"event": "note_gen_no_json", "ref": ref, "content": content})
            return None
        note_data = json.loads(match.group(0))
        logger.debug(f"✓ SUMMARIZER created note for {ref}", extra={"event": "summarizer_finished", "ref": ref})

        # Stream the note creation event
        if stream_event_callback:
            event_data = {
                "ref": ref,
                "commentator": commentator,
                "type": note_data.get("type"),
                "point": note_data.get("point")
            }
            logger.info(f"📝 Streaming note_created event: {event_data}")
            await stream_event_callback({"type": "note_created", "data": event_data})

        if not all(k in note_data for k in ["type", "point", "keywords"]):
            logger.warning("Generated note is missing required keys", extra={"event": "note_gen_missing_keys", "ref": ref, "data": note_data})
            return None
        note_data.update({'ref': ref, 'commentator': commentator} if commentator else {'ref': ref})
        return note_data
    except json.JSONDecodeError:
        logger.warning("Failed to decode JSON for note", extra={"event": "note_gen_json_error", "ref": ref, "content": content})
    except Exception as exc:
        logger.error("Note summarization failed", extra={"event": "note_gen_exception", "ref": ref, "error": str(exc)})
    return None

async def curate_links_with_llm(*, origin_ref: str, links: List[Dict[str, Any]], allowed_categories: List[str], limit: int, priority_commentators: List[str], plan_context: Optional[Dict[str, Any]], seen_refs: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    if not links or limit <= 0: return []
    try:
        client, curator_model, reasoning_params, capabilities = get_llm_for_task("CURATOR")
    except LLMConfigError as e:
        logger.error("Could not get LLM for curator, skipping LLM curation", extra={"event": "llm_config_error", "task": "CURATOR", "error": str(e)})
        return []

    initial_unseen_links = [link for link in links if link.get("ref") not in (seen_refs or set())]
    if not initial_unseen_links: return []

    max_candidates = CURATOR_MAX_CANDIDATES
    candidate_links: List[Dict[str, Any]] = []
    candidate_seen_refs: Set[str] = set()

    if priority_commentators:
        for commentator in priority_commentators:
            if len(candidate_links) >= max_candidates: break
            for link in initial_unseen_links:
                if len(candidate_links) >= max_candidates: break
                if link.get("commentator") == commentator and link.get("ref") not in candidate_seen_refs:
                    candidate_links.append(link)
                    candidate_seen_refs.add(link["ref"])
    
    for link in initial_unseen_links:
        if len(candidate_links) >= max_candidates: break
        if link.get("ref") not in candidate_seen_refs:
            candidate_links.append(link)
            candidate_seen_refs.add(link["ref"])

    logger.info(f"🧠 Asking CURATOR to select from {len(candidate_links)} candidates...", extra={"event": "llm_curation_started", "candidate_count": len(candidate_links)})

    available = [{"ref": link.get("ref", ""), "category": link.get("category", ""), "commentator": link.get("commentator", "")} for link in candidate_links]
    if not available: return []

    payload = {"origin_ref": origin_ref, "limit": min(limit, len(available)), "allowed_categories": allowed_categories, "priority_commentators": priority_commentators, "links": available, **(plan_context or {})}
    user_message = json.dumps(payload, ensure_ascii=False)
    logger.debug("Sending payload to curator LLM", extra={"event": "llm_curation_payload", "payload_size": len(user_message)})

    def _call_llm() -> str:
        curator_system_prompt = get_prompt("deep_research.curator_system")
        if not curator_system_prompt:
            logger.error("deep_research.curator_system prompt not found or failed to load.")
            return ""

        api_params = {"model": curator_model, "messages": [{"role": "system", "content": curator_system_prompt}, {"role": "user", "content": user_message}], **reasoning_params}
        if "json_mode" in capabilities: api_params["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**api_params)
        return response.choices[0].message.content or ""

    raw = await asyncio.to_thread(_call_llm)
    return _parse_curator_response(raw, candidate_links, set(allowed_categories), min(limit, len(available)))

def _parse_curator_response(raw: str, original_links: List[Dict[str, Any]], allowed_set: Set[str], limit: int) -> List[Dict[str, Any]]:
    if not raw: return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'{{.*?}}', raw, re.DOTALL)
        if not match: return []
        try: data = json.loads(match.group(0))
        except json.JSONDecodeError: return []
    
    if not isinstance(data, dict) or not isinstance(data.get("selected_refs"), list): return []

    selections: List[Dict[str, Any]] = []
    seen_refs: Set[str] = set()
    ref_to_link_map = {link.get("ref"): link for link in original_links if link.get("ref")}

    for ref in data.get("selected_refs", []):
        if len(selections) >= limit: break
        if not isinstance(ref, str) or ref in seen_refs: continue
        if original_link := ref_to_link_map.get(ref):
            selections.append(original_link)
            seen_refs.add(ref)
    return selections

def select_priority_links(links: List[Dict[str, Any]], allowed_categories: List[str], max_results: int, priority_commentators: List[str], session_seen_refs: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    if not links or max_results <= 0: return []
    external_seen = session_seen_refs or set()
    allowed_set = set(allowed_categories) if allowed_categories else set()
    selected: List[Dict[str, Any]] = []
    internal_seen_refs: set[str] = set()

    def add_link(link: Dict[str, Any]):
        if len(selected) >= max_results: return
        ref = link.get("ref")
        if not ref or ref in internal_seen_refs or ref in external_seen: return
        if allowed_set and link.get("category") not in allowed_set: return
        selected.append(link)
        internal_seen_refs.add(ref)

    for commentator in priority_commentators:
        for link in links:
            if len(selected) >= max_results: break
            if link.get("commentator") == commentator: add_link(link)
        if len(selected) >= max_results: break

    if len(selected) < max_results:
        for link in links:
            if len(selected) >= max_results: break
            add_link(link)
    return selected

async def _generate_research_draft(research_info: Optional[Dict[str, Any]], plan: Optional[Dict[str, Any]], is_final: bool = False) -> Optional[Dict[str, Any]]:
    if not isinstance(research_info, dict):
        logger.warning("Research info is not a dict, cannot generate draft", extra={"event": "draft_gen_skipped", "reason": "no_research_info"})
        return None
    notes = research_info.get("notes", [])
    if not notes:
        logger.error("No notes available for draft generation", extra={"event": "draft_gen_failed", "reason": "no_notes"})
        return {"draft": "Could not generate a draft as no research notes were available.", "draft_model": "system_fallback"}

    logger.info(f"✍️ Asking DRAFTER to generate draft from {len(notes)} notes...", extra={"event": "draft_generation_started", "note_count": len(notes), "is_final": is_final})
    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("DRAFTER")
    except LLMConfigError as e:
        logger.error("Could not get LLM for drafter", extra={"event": "llm_config_error", "task": "DRAFTER", "error": str(e)})
        return None

    note_lines = []
    for idx, note_chunk in enumerate(notes[:100 if is_final else 25], 1):
        if not isinstance(note_chunk, dict): continue
        note_text = note_chunk.get("text", "")
        try:
            note_data = json.loads(note_text)
            if not isinstance(note_data, dict): raise TypeError
            ref_label = f"{note_data.get('ref', '')} ({note_data.get('commentator')})" if note_data.get('commentator') else note_data.get('ref', '')
            note_lines.append(f"{idx}. [{note_data.get('type', 'Note')}] on {ref_label}\n   Point: {note_data.get('point', '')}\n   Keywords: {', '.join(note_data.get('keywords', []))}")
        except (json.JSONDecodeError, TypeError):
            ref = note_chunk.get("metadata", {}).get("source_ref", "unknown")
            note_lines.append(f"{idx}. Note: {ref}\n{note_text[:250].strip()}")

    if not note_lines: 
        logger.warning("No valid note lines created for draft", extra={"event": "draft_gen_failed", "reason": "no_valid_notes"})
        return None

    prompt_id = "deep_research.drafter_final" if is_final else "deep_research.drafter_interim"
    system_msg = get_prompt(prompt_id)
    if not system_msg:
        logger.error(f"{prompt_id} prompt not found or failed to load. Aborting draft generation.")
        return None

    user_prompt_intro = "Synthesize all the following research notes into a complete and final drasha:" if is_final else "Research notes for your drasha:"
    parts = [user_prompt_intro, "\n".join(note_lines)]
    if (focus := plan.get("focus")): parts.append(f"Primary focus: {focus}")
    if (guiding := plan.get("guiding_questions")): parts.append("Address these guiding questions:\n" + "\n".join(f"- {q}" for q in guiding))
    user_msg = "\n\n".join(parts)
    
    logger.debug(f"Calling drafter with {len(user_msg)} chars input", extra={"event": "drafter_call"})
    try:
        api_params = {"model": model, "messages": [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}], **reasoning_params}
        response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        raw_draft = (response.choices[0].message.content or "").strip()
        cleaned_draft = re.sub(r"<think>.*?</think>", "", raw_draft, flags=re.DOTALL).strip()
        if cleaned_draft:
            logger.info(f"✓ DRAFTER finished draft ({len(cleaned_draft)} chars).", extra={"event": "draft_generation_success", "char_length": len(cleaned_draft), "model": model})
            logger.debug(f"DRAFTER result snippet: {cleaned_draft[:250]}...")
            return {"draft": cleaned_draft, "draft_model": model}
        else:
            logger.warning("Draft generation returned empty result", extra={"event": "draft_gen_empty"})
    except Exception as exc:
        logger.error("Draft generation failed", extra={"event": "draft_gen_exception", "error": str(exc)})
    return None
