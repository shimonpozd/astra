import asyncio
import json
import os
import re
import logging
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

from ..state import state

import logging_utils

logger = logging_utils.get_logger("brain-dr-orch", service="brain", module="deep_research")

MAX_RECURSION_DEPTH = int(os.getenv("ASTRA_MAX_RESEARCH_DEPTH", "2"))

def _slugify(value: str) -> str:
    filtered = ''.join(ch.lower() if ch.isalnum() else '_' for ch in value)
    parts = [p for p in filtered.split('_') if p]
    return '_'.join(parts) or 'study'

def generate_collection_name(base: str, session_id: str, reference: str | None, prompt: str | None) -> str:
    source = reference or prompt or ''
    slug = _slugify(source)[:48]
    session_slug = session_id.split('-')[0]
    return f"{base}_session_{session_slug}_{slug}" if slug else f"{base}_session_{session_slug}"


CATEGORY_ORDER = [
    "Commentary",
    "Talmud",
    "Halakhah",
    "Responsa",
    "Mishnah",
    "Midrash",
    "Jewish Thought",
    "Chasidut",
    "Kabbalah",
    "Modern Works",
    "Bible",
]

DEFAULT_COMMENTARY_CATEGORIES = [
    "Commentary",
    "Talmud",
    "Halakhah",
    "Responsa",
    "Mishnah",
    "Midrash",
    "Jewish Thought",
    "Chasidut",
    "Kabbalah",
]
DEFAULT_PRIORITY_COMMENTATORS = [
    "Rashi",
    "Ramban",
    "Ibn Ezra",
    "Sforno",
    "Ralbag",
    "Abarbanel",
    "Bartenura",
]
DEFAULT_MAX_COMMENTARIES = 6

COMMENTARY_CATEGORY_QUOTAS = {
    "Talmud": 8,
    "Commentary": 8,
    "Halakhah": 6,
    "Responsa": 4,
    "Jewish Law": 5,
    "Kabbalah": 4,
    "Chasidut": 4,
}
DEFAULT_CATEGORY_QUOTA = 4
MAX_PRIMARY_CHUNKS = 8
MAX_COMMENTARY_CHUNKS = 4

SUMMARY_MODEL = os.getenv("ASTRA_RESEARCH_SUMMARY_MODEL") or os.getenv("OPENAI_MODEL") or os.getenv("OLLAMA_MODEL")
NOTE_MAX_CHARS = int(os.getenv("ASTRA_RESEARCH_NOTE_MAX_CHARS", "480"))

CURATOR_SYSTEM_PROMPT = '''You are a senior researcher selecting Sefaria commentaries for a focused Torah study.
Choose only from the provided links and respect the requested limit.
Return pure JSON in the form {"selected_refs": ["ref1", "ref2", ...]}.
Do not invent refs. Prioritize the study goals.
IMPORTANT: If you see multiple links from the same commentator that seem to be part of a sequence (e.g., ending in :1, :2, :3), you should select ALL of them to preserve the full context of the commentary.'''

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
) -> Tuple[Dict[str, Any], Set[str], Optional[str]]:
    logger.info("--- Starting prepare_deepresearch_payload ---")
    processed_refs: Set[str] = set()
    current_seen_refs = seen_refs or set()
    note_collection_name: Optional[str] = None

    research_info: Dict[str, Any] = {
        "prompt": prompt,
        "collection": collection_base,
        "chunks_stored": 0,
        "memory_status": "skipped",
        "sources": [],
        "commentaries": [],
    }
    if plan:
        research_info["plan"] = plan

    if not plan or not plan.get("primary_ref"):
        research_info["memory_status"] = "skipped"
        research_info["skip_reason"] = "no_primary_ref"
        logger.warning("No primary_ref in plan, cannot proceed")
        return research_info, processed_refs, note_collection_name

    primary_ref = plan["primary_ref"]
    logger.info(f"Primary reference: {primary_ref}")
    
    logger.info(f"Current seen refs: {len(current_seen_refs)}")
    logger.info(f"Plan categories: {plan.get('categories', [])}")
    
    combined_chunks: List[Chunk] = []
    chunk_metadatas: List[Dict[str, Any]] = []
    note_chunks: List[Chunk] = []
    note_metadatas: List[Dict[str, Any]] = []

    # 1. Source-First: Fetch and store the primary text if not seen
    if primary_ref not in current_seen_refs:
        processed_refs.add(primary_ref)
        try:
            text_payload = await sefaria_get_text_v3_async(primary_ref)
        except Exception as e:
            logger.error(f"Sefaria API call failed for primary_ref {primary_ref}: {e}", exc_info=True)
            research_info["memory_status"] = "error"
            research_info["error_details"] = f"Sefaria API call failed for {primary_ref}"
            return research_info, processed_refs, note_collection_name
        
        if text_payload.get("ok"):
            base_data = text_payload.get("data") or {}
            base_text = base_data.get("text")
            if base_text:
                logger.info("Processing primary text...")
                chunks = chunk_text(base_text)
                for chunk in chunks:
                    position = len(combined_chunks)
                    combined_chunks.append(Chunk(text=chunk.text, index=position))
                    chunk_metadatas.append({
                        "collection_layer": "raw", "source": "primary", "source_ref": primary_ref, "chunk_index": position,
                    })
                    note_text = await _summarize_note_text(chunk.text, ref=primary_ref, role="primary")
                    if note_text:
                        note_chunks.append(Chunk(text=note_text, index=len(note_chunks)))
                        note_metadatas.append({
                            "collection_layer": "notes", "note_type": "primary", "source_ref": primary_ref, "original_chunk_index": position,
                        })

    # 2. Route Execution: Collect commentaries for each category in the route
    route = plan.get("categories", [])
    logger.info(f"Initial research route: {route}")
    max_commentaries = plan.get("commentary_preferences", {}).get("max_per_category", DEFAULT_MAX_COMMENTARIES)
    priority_commentators = plan.get("commentary_preferences", {}).get("priority_commentators", DEFAULT_PRIORITY_COMMENTATORS)

    # --- New Step-by-Step Curation & Route Expansion Logic ---
    processed_categories = set()
    while True:
        categories_to_process = [cat for cat in route if cat not in processed_categories]
        if not categories_to_process:
            break

        for category in categories_to_process:
            logger.info(f"Fetching commentaries for category: {category}")
            processed_categories.add(category)
            try:
                links_result = await sefaria_get_related_links_async(primary_ref, categories=[category])
            except Exception as e:
                logger.error(f"Sefaria API call failed for related links on {primary_ref} (category: {category}): {e}", exc_info=True)
                continue
            if not links_result.get("ok"): continue
            
            links = links_result.get("data") or []
            logger.info(f"Found {len(links)} links for category {category}")
            
            logger.info("Curating links...")
            curated_links = await curate_links_with_llm(
                origin_ref=primary_ref, links=links, allowed_categories=[category], limit=max_commentaries * 2, # Get more candidates
                priority_commentators=priority_commentators, plan_context=plan, seen_refs=current_seen_refs
            )
            selected_links = curated_links or select_priority_links(links, [category], max_commentaries * 2, priority_commentators)
            logger.info(f"Selected {len(selected_links)} links after curation.")
            logger.info(f"Curator selected links to process: {[link.get('ref') for link in selected_links]}")

            validated_commentaries_count = 0
            if selected_links:
                logger.info(f"Starting step-by-step validation for {len(selected_links)} curated links...")
                for i, link in enumerate(selected_links):
                    if validated_commentaries_count >= max_commentaries:
                        logger.info("Reached max commentaries for this category, stopping validation.")
                        break

                    commentary_ref = link.get("ref")
                    if not commentary_ref or commentary_ref in current_seen_refs:
                        continue

                    logger.info(f"Validating link {i+1}/{len(selected_links)}: {commentary_ref}")
                    try:
                        text_payload = await sefaria_get_text_v3_async(commentary_ref)
                        if text_payload.get("ok"):
                            commentary_data = text_payload.get("data") or {}
                            commentary_text = commentary_data.get("text")
                            if commentary_text:
                                logger.info(f"Link VALID: {commentary_ref}")
                                validated_commentaries_count += 1
                                processed_refs.add(commentary_ref)
                                current_seen_refs.add(commentary_ref)
                                
                                chunks = chunk_text(commentary_text)
                                for chunk in chunks:
                                    position = len(combined_chunks)
                                    combined_chunks.append(Chunk(text=chunk.text, index=position))
                                    chunk_metadatas.append({
                                        "collection_layer": "raw", "source": "commentary", "source_ref": commentary_ref,
                                        "category": category, "chunk_index": position,
                                    })
                                    note_text = await _summarize_note_text(chunk.text, ref=commentary_ref, role="commentary")
                                    if note_text:
                                        note_chunks.append(Chunk(text=note_text, index=len(note_chunks)))
                                        note_metadatas.append({
                                            "collection_layer": "notes", "note_type": "commentary", "source_ref": commentary_ref, "original_chunk_index": position,
                                        })
                            else:
                                logger.warning(f"Link INVALID (API error or empty text): {commentary_ref}")
                    except Exception as e:
                        logger.error(f"Exception during link validation for {commentary_ref}: {e}", exc_info=True)
                        continue

        # If after processing all initial categories, we have no chunks, expand the route
        if not combined_chunks and "Commentary" in processed_categories:
            logger.warning("No commentaries found or all were invalid. Expanding route to Talmud and Halakhah.")
            if "Talmud" not in route:
                route.append("Talmud")
            if "Halakhah" not in route:
                route.append("Halakhah")
        else:
            # If we found something or already tried expanding, break the loop
            break

    collection_slug = generate_collection_name(collection_base, session_id, primary_ref, prompt)
    raw_collection_name = f"{collection_slug}_raw"
    note_collection_name = f"{collection_slug}_notes"

    logger.info(f"Storing {len(combined_chunks)} raw chunks and {len(note_chunks)} note chunks.")
    if combined_chunks:
        await store_chunks_in_memory(
            base_url=memory_service_url, collection=raw_collection_name, user_id=user_id, session_id=session_id,
            agent_id=agent_id, chunks=combined_chunks, chunk_metadata=chunk_metadatas,
        )

    if note_chunks:
        await store_chunks_in_memory(
            base_url=memory_service_url, collection=note_collection_name, user_id=user_id, session_id=session_id,
            agent_id=agent_id, chunks=note_chunks, chunk_metadata=note_metadatas,
        )

    research_info["chunks_stored"] = len(combined_chunks)
    research_info["memory_status"] = "success" if combined_chunks else "skipped"
    research_info["collection"] = raw_collection_name

    # After storing in memory, populate research_info with summaries for downstream modules
    research_info["note_collection"] = note_collection_name
    research_info["sources"] = _build_source_entries(prompt, plan)
    research_info["primary_summary"] = [{"ref": plan.get("primary_ref"), "chunks": len([m for m in chunk_metadatas if m.get("source")=="primary"])}]
    
    cat_counts = {}
    commentators = {}
    for md in chunk_metadatas:
        if md.get("source") == "commentary":
            cat = md.get("category") or "Commentary"
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
    for md in chunk_metadatas:
        if md.get("source") == "commentary":
            cat = md.get("category") or "Commentary"
            commentators.setdefault(cat, set()).add(md.get("source_ref","" ).split(" on ")[0])
    research_info["commentary_summary"] = {
        cat: {"count": cat_counts[cat], "commentators": sorted(list(commentators.get(cat, [])))[:6]}
        for cat in cat_counts
    }

    research_info["notes"] = [
        {"ref": md.get("source_ref"), "role": ("primary" if md.get("source")=="primary" else "commentary"),
         "summary": chunk.text[:NOTE_MAX_CHARS]}
        for chunk, md in zip(combined_chunks, chunk_metadatas)
    ][:30]

    preview = await _try_fetch_research_preview(
        memory_service_url=memory_service_url,
        user_id=user_id, session_id=session_id,
        collection=raw_collection_name, limit=18
    )
    if preview:
        research_info["memory_preview"] = preview

    logger.info(f"--- Exiting prepare_deepresearch_payload (success) ---")
    return research_info, processed_refs, note_collection_name


async def _try_fetch_research_preview(
    *,
    memory_service_url: str,
    user_id: str,
    session_id: str,
    collection: str,
    limit: int = 24,
) -> Optional[Dict[str, Any]]:
    if not memory_service_url:
        return None

    client = state.http_client
    if client is None:
        client = httpx.AsyncClient()
        state.http_client = client

    url = f"{memory_service_url.rstrip('/')}/research/recall"
    payload = {
        "user_id": user_id,
        "session_id": session_id,
        "collection": collection,
        "limit": limit,
    }
    logger.info(f"Sending payload to /research/recall: {json.dumps(payload)}")

    try:
        response = await client.post(url, json=payload, timeout=8.0)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to fetch research preview. Status: {response.status_code}, Response: {response.text}")
            return {"error": response.text, "status_code": response.status_code} # Return error info
    except Exception as exc:
        logger.error("Exception in _try_fetch_research_preview: %s", exc, exc_info=True)
        return None


def _build_source_entries(prompt: str, plan: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    if plan:
        primary_items = plan.get("primary_refs", [])
        if not primary_items and plan.get("primary_ref"):
            primary_items = [plan["primary_ref"]]

        for item in primary_items:
            if isinstance(item, dict):
                entries.append({
                    "role": "primary",
                    "ref": item.get("ref", ""),
                    "categories": item.get("categories", []),
                })
            else:
                entries.append({"role": "primary", "ref": str(item), "categories": plan.get("categories", [])})

        for item in plan.get("supporting_refs", []):
            if isinstance(item, dict):
                entries.append({
                    "role": "supporting",
                    "ref": item.get("ref", ""),
                    "categories": item.get("categories", []),
                })
            else:
                entries.append({"role": "supporting", "ref": str(item), "categories": []})
    if not entries:
        return []
    return entries


def _build_category_list(ref: str, initial: Optional[List[str]], role: str) -> List[str]:
    categories: List[str] = []

    def add(cat: Optional[str]) -> None:
        if not isinstance(cat, str):
            return
        clean = cat.strip()
        if not clean:
            return
        if clean not in categories:
            categories.append(clean)

    for cat in initial or []:
        add(cat)

    lower_ref = ref.lower()
    if "talmud" in lower_ref:
        add("Talmud")
        add("Commentary")
    if "mishnah" in lower_ref:
        add("Mishnah")
        add("Talmud")
        add("Commentary")
    if "shulchan arukh" in lower_ref or "shulchan aruch" in lower_ref:
        add("Commentary")
        add("Halakhah")
        add("Responsa")
    if "mishneh torah" in lower_ref:
        add("Halakhah")
        add("Responsa")
        add("Commentary")

    if role == "primary":
        add("Commentary")

    for cat in DEFAULT_COMMENTARY_CATEGORIES:
        add(cat)

    ordered: List[str] = []
    for cat in CATEGORY_ORDER:
        if cat in categories and cat not in ordered:
            ordered.append(cat)
    for cat in categories:
        if cat not in ordered:
            ordered.append(cat)
    return ordered


async def _summarize_note_text(
    text: Optional[str],
    *,
    ref: str,
    role: str,
    is_chunk: bool = False,
    title: Optional[str] = None,
    commentator: Optional[str] = None,
) -> str:
    if not text:
        return ""
    trimmed = text.strip()
    if not trimmed:
        return ""

    fallback = trimmed[:NOTE_MAX_CHARS]

    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("SUMMARIZER")
    except LLMConfigError as e:
        logger.warning(f"Could not get LLM for summarizer, using fallback: {e}")
        return fallback

    descriptor = role
    if commentator:
        descriptor += f" by {commentator}"
    elif title:
        descriptor += f" ({title})"

    if is_chunk:
        system_prompt = (
            "You are preparing concise research notes for a Torah drasha. "
            "For the following small text chunk, extract the single most important point, question, or connection. "
            "Be very brief and focused. Output only the note itself, without preamble."
        )
        user_prompt = f"Reference: {ref}\nRole: {descriptor}\n\nChunk:\n{trimmed}\n\nNote:"
    else:
        system_prompt = (
            "You are preparing concise research notes for a Torah drasha. "
            "Extract the core halakhic or thematic points in 2-3 sentences, "
            "mention the reference, and keep the summary focused on what must appear in the final drasha."
        )
        user_prompt = (
            f"Reference: {ref}\nRole: {descriptor}\n\nExcerpt:\n{trimmed}\n\n" 
            "Summarize the excerpt as notes."
        )

    try:
        api_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            **reasoning_params,
        }
        response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        content = (response.choices[0].message.content or "").strip()
        if content:
            return content[:NOTE_MAX_CHARS]
    except Exception as exc:
        logger.debug("Note summarization failed for %s: %s", ref, exc)
    return fallback

def _is_important_link(link: Dict[str, Any]) -> bool:
    return link.get("category") in {"Talmud", "Halakhah", "Responsa"}

async def _collect_commentaries_recursive(
    tref: str,
    categories: List[str],
    max_commentaries: int,
    priority_commentators: List[str],
    research_depth: int,
    plan_context: Optional[Dict[str, Any]],
    seen_refs: Set[str],
    level: int = 0,
) -> List[Dict[str, Any]]:
    if level > MAX_RECURSION_DEPTH:
        return []

    logger.info(f"Collecting commentaries for {tref} at level {level}")
    
    collected_commentaries = await _collect_commentaries(
        tref,
        categories,
        max_commentaries,
        priority_commentators,
        research_depth,
        plan_context,
        seen_refs=seen_refs,
    )

    all_commentaries = list(collected_commentaries)
    seen_refs.update(c.get("ref") for c in all_commentaries if c.get("ref"))

    for commentary in collected_commentaries:
        if _is_important_link(commentary):
            logger.info(f"Found important link: {commentary.get('ref')}. Going deeper.")
            
            sub_categories = ["Commentary"]
            
            sub_commentaries = await _collect_commentaries_recursive(
                tref=commentary.get("ref"),
                categories=sub_categories,
                max_commentaries=max_commentaries,
                priority_commentators=priority_commentators,
                research_depth=research_depth,
                plan_context=plan_context,
                seen_refs=seen_refs,
                level=level + 1,
            )
            
            for sub_comm in sub_commentaries:
                sub_comm["commentary_on_ref"] = commentary.get("ref")
            
            all_commentaries.extend(sub_commentaries)

    return all_commentaries

async def _collect_commentaries(
    tref: str,
    categories: List[str],
    max_commentaries: int,
    priority_commentators: List[str],
    research_depth: int,
    plan_context: Optional[Dict[str, Any]],
    seen_refs: Set[str],
) -> List[Dict[str, Any]]:
    limit_candidates = []
    if isinstance(max_commentaries, int) and max_commentaries > 0:
        limit_candidates.append(max_commentaries)
    if isinstance(research_depth, int) and research_depth > 0:
        limit_candidates.append(research_depth)
    limit = min(limit_candidates) if limit_candidates else max_commentaries or 6  # Ð´ÐµÑ„Ð¾Ð»Ñ‚
    if limit <= 0:
        return []

    fetch_limit = max(limit * 4, 120)

    try:
        links_result = await sefaria_get_related_links_async(
            tref,
            categories=categories,
            limit=fetch_limit,
        )
        if not links_result.get("ok"):
            return []
        links = links_result.get("data") or []
        logger.info(
            "Sefaria returned %d related links for %s (fetch_limit=%d, categories=%s)",
            len(links),
            tref,
            fetch_limit,
            categories,
        )
    except Exception as e:
        logger.error("Failed to fetch commentaries: %s", e, exc_info=True)
        return []

    curated_links = await curate_links_with_llm(
        origin_ref=tref,
        links=links,
        allowed_categories=categories,
        limit=limit,
        priority_commentators=priority_commentators,
        plan_context=plan_context,
    )
    selected_links = curated_links or select_priority_links(links, categories, limit, priority_commentators)
    
    # Filter out already seen refs
    unseen_links = [link for link in selected_links if link.get("ref") not in seen_refs]
    logger.info(
        f"Curator selected {len(unseen_links)} unseen links for {tref} (out of {len(selected_links)} total)."
    )

    commentaries: List[Dict[str, Any]] = []

    for link in unseen_links:
        commentator = link.get("commentator") or ""
        ref = link.get("ref")
        if not ref:
            continue
        try:
            text_result = await sefaria_get_text_v3_async(ref)
            if not text_result.get("ok"):
                continue
            data = text_result.get("data") or {}
            text = data.get("text")
            if not text:
                continue
            chunks = chunk_text(text)
            commentaries.append({
                "commentator": commentator,
                "category": link.get("category"),
                "ref": ref,
                "text": text,
                "chunks": chunks,
                "data": data,
            })
        except Exception as e:
            logger.warning("Failed to fetch commentary %s (%s): %s", commentator, ref, e)
            continue

    return commentaries


async def curate_links_with_llm(
    *,
    origin_ref: str,
    links: List[Dict[str, Any]],
    allowed_categories: List[str],
    limit: int,
    priority_commentators: List[str],
    plan_context: Optional[Dict[str, Any]],
    research_goal: Optional[str] = None,
    seen_refs: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    if not links or limit <= 0:
        return []
    
    try:
        client, curator_model, reasoning_params, capabilities = get_llm_for_task("CURATOR")
    except LLMConfigError as e:
        logger.error(f"Could not get LLM for curator, skipping LLM curation: {e}")
        return []

    # Filter out already seen links before doing any processing
    initial_unseen_links = [link for link in links if link.get("ref") not in (seen_refs or set())]
    if not initial_unseen_links:
        logger.info("No new unseen links to curate.")
        return []

    MAX_CANDIDATES_FOR_CURATOR = int(os.getenv("ASTRA_CURATOR_MAX_CANDIDATES", "30"))
    candidate_links: List[Dict[str, Any]] = []
    candidate_seen_refs: Set[str] = set()

    if priority_commentators:
        for commentator in priority_commentators:
            if len(candidate_links) >= MAX_CANDIDATES_FOR_CURATOR:
                break
            for link in initial_unseen_links:
                if len(candidate_links) >= MAX_CANDIDATES_FOR_CURATOR:
                    break
                if link.get("commentator") == commentator and link.get("ref") not in candidate_seen_refs:
                    candidate_links.append(link)
                    candidate_seen_refs.add(link["ref"])
    
    for link in initial_unseen_links:
        if len(candidate_links) >= MAX_CANDIDATES_FOR_CURATOR:
            break
        if link.get("ref") not in candidate_seen_refs:
            candidate_links.append(link)
            candidate_seen_refs.add(link["ref"])

    logger.info(f"Pre-filtered {len(links)} links down to {len(candidate_links)} candidates for the curator LLM.")

    allowed_set: Set[str] = {c for c in allowed_categories if isinstance(c, str)}
    filtered_links: List[Dict[str, Any]] = []
    available: List[Dict[str, Any]] = []
    for link in candidate_links:
        category = link.get("category")
        if allowed_set and category not in allowed_set:
            continue
        filtered_links.append(link)
        available.append({
            "ref": link.get("ref", ""),
            "category": category or "",
            "commentator": link.get("commentator", ""),
            "anchorRef": link.get("anchorRef"),
            "commentaryNum": link.get("commentaryNum"),
        })
    if not available:
        return []

    payload = {
        "origin_ref": origin_ref,
        "limit": min(limit, len(available)),
        "allowed_categories": list(allowed_set) if allowed_set else allowed_categories,
        "priority_commentators": priority_commentators,
        "research_goal": research_goal or "",
        "focus": "",
        "guiding_questions": [],
        "outline": [],
        "links": available,
    }
    if isinstance(plan_context, dict):
        if isinstance(plan_context.get("focus"), str):
            payload["focus"] = plan_context.get("focus")
        if isinstance(plan_context.get("guiding_questions"), list):
            payload["guiding_questions"] = [q for q in plan_context.get("guiding_questions") if isinstance(q, str)]
        if isinstance(plan_context.get("outline"), list):
            payload["outline"] = [o for o in plan_context.get("outline") if isinstance(o, str)]

    user_message = json.dumps(payload, ensure_ascii=False)
    logger.info(f"Sending payload to curator LLM ({len(user_message)} chars): {user_message[:1000]}...")

    def _call_llm() -> str:
        api_params = {
            "model": curator_model,
            "messages": [
                {"role": "system", "content": CURATOR_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            **reasoning_params,
        }
        if "json_mode" in capabilities:
            api_params["response_format"] = {"type": "json_object"}
        
        response = client.chat.completions.create(**api_params)
        return response.choices[0].message.content or ""

    raw = await asyncio.to_thread(_call_llm)
    return _parse_curator_response(raw, filtered_links, allowed_set, min(limit, len(available)))


def _parse_curator_response(
    raw: str,
    original_links: List[Dict[str, Any]],
    allowed_set: Set[str],
    limit: int,
) -> List[Dict[str, Any]]:
    if not raw:
        return []

    data: Any = None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'{{{.*}}}', raw, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                data = None
    
    if not isinstance(data, dict) or not isinstance(data.get("selected_refs"), list):
        return []

    selections: List[Dict[str, Any]] = []
    seen_refs: Set[str] = set()
    
    ref_to_link_map = {link.get("ref"): link for link in original_links if link.get("ref")}

    selected_refs = data.get("selected_refs", [])

    for ref in selected_refs:
        if len(selections) >= limit:
            break
        if not isinstance(ref, str) or ref in seen_refs:
            continue
        
        original_link = ref_to_link_map.get(ref)
        if original_link:
            selections.append(original_link)
            seen_refs.add(ref)

    return selections

def select_priority_links(
    links: List[Dict[str, Any]],
    allowed_categories: List[str],
    max_results: int,
    priority_commentators: List[str],
) -> List[Dict[str, Any]]:
    if not links or max_results <= 0:
        return []

    allowed_set = set(allowed_categories) if allowed_categories else set()
    selected: List[Dict[str, Any]] = []
    seen_refs: set[str] = set()

    def add_link(link: Dict[str, Any]) -> None:
        if len(selected) >= max_results:
            return
        ref = link.get("ref")
        if not ref or ref in seen_refs:
            return
        if allowed_set and link.get("category") not in allowed_set:
            return
        selected.append(link)
        seen_refs.add(ref)

    for commentator in priority_commentators:
        for link in links:
            if len(selected) >= max_results:
                break
            if link.get("commentator") == commentator:
                add_link(link)
        if len(selected) >= max_results:
            break

    if len(selected) < max_results:
        for link in links:
            if len(selected) >= max_results:
                break
            add_link(link)

    return selected


def _enforce_commentary_quotas(entries: List[Dict[str, Any]], max_total: int) -> List[Dict[str, Any]]:
    if max_total <= 0 or not entries:
        return []

    category_counts: Dict[str, int] = defaultdict(int)
    seen_refs: Set[str] = set()
    filtered: List[Dict[str, Any]] = []
    logger.info(f"[_enforce_commentary_quotas] Starting with {len(entries)} entries and max_total={max_total}.")

    for i, entry in enumerate(entries):
        ref = entry.get("ref")
        if not isinstance(ref, str) or not ref.strip():
            logger.warning(f"[_enforce_commentary_quotas] Discarding entry {i} due to invalid ref.")
            continue
        
        ref_key = ref.strip()
        if ref_key in seen_refs:
            logger.info(f"[_enforce_commentary_quotas] Discarding entry {i} ('{ref_key}') as duplicate.")
            continue
        
        category_label = entry.get("category") or "Uncategorized"
        quota = COMMENTARY_CATEGORY_QUOTAS.get(category_label, DEFAULT_CATEGORY_QUOTA)
        if category_counts[category_label] >= quota:
            logger.info(f"[_enforce_commentary_quotas] Discarding entry {i} ('{ref_key}') because category '{category_label}' reached its quota of {quota}.")
            continue
        
        logger.info(f"[_enforce_commentary_quotas] Keeping entry {i} ('{ref_key}').")
        category_counts[category_label] += 1
        filtered.append(entry)
        seen_refs.add(ref_key)
        if len(filtered) >= max_total:
            logger.info(f"[_enforce_commentary_quotas] Reached max_total of {max_total}. Stopping.")
            break

    # The second loop for filling remaining spots is redundant if the first loop is correct and the input is pre-filtered.
    # I'm removing it to simplify the logic and prevent potential bugs.

    logger.info(f"[_enforce_commentary_quotas] Finished with {len(filtered)} entries.")
    return filtered[:max_total]

def _compute_missing_coverage(
    selected_commentaries: List[Dict[str, Any]],
    requested_categories: List[str]
) -> List[str]:
    if not requested_categories:
        return []
    
    present_categories = {comm.get("category") for comm in selected_commentaries if comm.get("category")}
    missing = [cat for cat in requested_categories if cat not in present_categories]
    
    if missing:
        logger.info(f"Coverage check: missing categories {missing}. Requested: {requested_categories}, Present: {list(present_categories)}")
        
    return missing

async def _generate_research_draft(
    research_info: Optional[Dict[str, Any]],
    plan: Optional[Dict[str, Any]],
    is_final: bool = False,
) -> Optional[Dict[str, Any]]:
    if not isinstance(research_info, dict):
        logger.warning("Research info is not a dict, cannot generate draft")
        return None
        
    notes = research_info.get("notes", [])
    
    if not notes:
        logger.error("No notes available for draft generation, returning fallback draft.")
        return {
            "draft": "Could not generate a draft as no research notes were available. Please try refining the plan or broadening the research scope.",
            "draft_model": "system_fallback"
        }

    logger.info(f"Generating draft with {len(notes)} notes. Final draft: {is_final}")

    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("DRAFTER")
    except LLMConfigError as e:
        logger.error(f"Could not get LLM for drafter: {e}")
        return None

    note_limit = 100 if is_final else 25 # Use more notes for the final draft
    note_lines: List[str] = []
    for idx, note in enumerate(notes[:note_limit], 1):
        if not isinstance(note, dict):
            continue
        ref = note.get("ref") or note.get("origin_ref") or "unknown"
        commentator = note.get("commentator")
        role = note.get("role") or note.get("note_type") or "note"
        summary = (note.get("summary") or "").strip()
        
        if not summary:
            summary = note.get("text", "").strip()[:200] + "..."
        
        if commentator:
            ref_label = f"{ref} ({commentator})"
        else:
            ref_label = ref
        note_lines.append(f"{idx}. {role}: {ref_label}\n{summary}")

    if not note_lines:
        logger.warning("No valid note lines created, cannot generate draft")
        return None

    focus = plan.get("focus") if isinstance(plan, dict) else None
    guiding = plan.get("guiding_questions") if isinstance(plan, dict) else []

    if is_final:
        system_msg = (
            "You are a Torah scholar and writer, tasked with synthesizing research into a final, polished drasha (lesson). "
            "Using all the provided research notes, write a complete, coherent, and well-structured document. Your final output should be a self-contained text, ready for presentation.\n\n"
            "Structure your response with a clear introduction, body paragraphs that analyze the sources, and a strong conclusion with practical insights (hiddush). Cite sources properly."
        )
        user_prompt_intro = "Synthesize all the following research notes into a complete and final drasha:"
    else:
        system_msg = (
            "You are drafting a structured Torah drasha based on prepared research notes. "
            "Create a coherent, well-structured analysis that:\n"
            "1. Opens with the primary source and its plain meaning (pshat)\n"
            "2. Presents commentaries and different perspectives\n"
            "3. Identifies and analyzes any contradictions between sources\n"
            "4. Concludes with practical lessons or insights (hiddush)\n\n"
            "Structure your response with clear sections and cite sources properly."
        )
        user_prompt_intro = "Research notes for your drasha:"

    parts = [user_prompt_intro, "\n".join(note_lines)]
    if focus:
        parts.append(f"Primary focus: {focus}")
    if guiding:
        parts.append("Address these guiding questions:\n" + "\n".join(f"- {q}" for q in guiding))
    
    user_msg = "\n\n".join(parts)
    
    logger.info(f"Calling drafter with {len(user_msg)} chars input")

    try:
        api_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            **reasoning_params,
        }
        response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        raw_draft = (response.choices[0].message.content or "").strip()
        
        cleaned_draft = re.sub(r"<think>.*?</think>", "", raw_draft, flags=re.DOTALL).strip()

        if cleaned_draft:
            logger.info("Generated research draft (%d chars) using model %s", len(cleaned_draft), model)
            return {"draft": cleaned_draft, "draft_model": model}
        else:
            logger.warning("Draft generation returned empty result")
    except Exception as exc:
        logger.error(f"Draft generation failed: %s", exc, exc_info=True)
    
    return None