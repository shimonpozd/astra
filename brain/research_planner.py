import asyncio
import json
import os
import re
import string
from typing import Any, Dict, List, Optional

from .llm_config import get_llm_for_task, LLMConfigError, get_reasoning_params
from .settings import DEFAULT_RESEARCH_DEPTH
from copy import deepcopy
from config.prompts import get_prompt

import logging_utils

DEFAULT_INITIAL_PARAMS = {
    "primary_ref": "", "categories": [], "priority_commentators": [], 
    "concepts_for_external_search": [], "search_depth": 15,
}

def _normalize_ref_text(text: str) -> str:
    text = text.translate(_SANITIZE_TRANSLATION)
    text = text.lower()
    text = text.replace("иоре деа", "yoreh de'ah")
    return text

def _extract_primary_ref_fallback(text: str) -> Optional[str]:
    normalized_text = _normalize_ref_text(text)
    greedy_regex = r'((?:[A-Za-z]+\s)?[A-Za-z]+\s\d+[:.]\d+)'
    match = re.search(greedy_regex, normalized_text)
    if match:
        ref = match.group(1).strip()
        return ref
    return None

def detect_primary_type(tref: str) -> str:
    tref_lower = tref.lower()
    if any(word in tref_lower for word in ["shulchan arukh", "shulchan aruch", "sh a"]):
        return "Halakhah"
    if "mishnah" in tref_lower or "mishna" in tref_lower:
        return "Mishnah"
    if "talmud" in tref_lower or any(word in tref_lower for word in ["berakhot", "shabbat", "bava"]):
        return "Talmud"
    if any(word in tref_lower for word in ["tanakh", "genesis", "exodus"]):
        return "Bible"
    return "Bible"

async def parse_initial_request(structured_query: Dict[str, Any], language: Optional[str] = None) -> Dict[str, Any]:
    """
    Parses a structured query to extract a research plan.
    """
    logger.info("Starting initial plan parsing", extra={"event": "plan_parsing_started"})
    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("PLANNER")
    except LLMConfigError as e:
        logger.error("Could not get LLM for initial parser", extra={"event": "llm_config_error", "error": str(e)})
        return deepcopy(DEFAULT_INITIAL_PARAMS)

    prompt_template = get_prompt("research_planner.initial_parser")
    if not prompt_template:
        logger.error("research_planner.initial_parser prompt not found or failed to load.")
        return deepcopy(DEFAULT_INITIAL_PARAMS)

    user_request = structured_query.get("user_request", "")
    prompt_template = prompt_template.replace("{{user_request}}", user_request)
    prompt_template = prompt_template.replace("{{critic_feedback}}", structured_query.get("critic_feedback", "No feedback yet."))

    user_prompt = prompt_template

    def _call_llm() -> str:
        api_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": get_prompt("research_planner.initial_parser")},
                {"role": "user", "content": user_prompt},
            ],
            **reasoning_params,
        }
        if "json_mode" in capabilities:
            api_params["response_format"] = {"type": "json_object"}
        
        response = client.chat.completions.create(**api_params)
        return response.choices[0].message.content or ""

    raw = await asyncio.to_thread(_call_llm)
    logger.debug("Initial parser raw response", extra={"event": "llm_response_received", "llm_output": raw})

    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
    
    data = {}
    if match:
        json_candidate = match.group(0)
        try:
            data = json.loads(json_candidate)
            if not isinstance(data, dict):
                data = {}
            logger.debug("Successfully parsed JSON from LLM response", extra={"event": "llm_response_parsed", "data": data})
        except json.JSONDecodeError:
            logger.warning("Failed to decode JSON from LLM response", extra={"event": "json_decode_error", "content": json_candidate})
    else:
        logger.warning("No JSON object found in LLM response", extra={"event": "json_not_found", "content": cleaned})

    merged_params = deepcopy(DEFAULT_INITIAL_PARAMS)
    try:
        merged_params["search_depth"] = DEFAULT_RESEARCH_DEPTH
    except (ValueError, TypeError):
        pass

    if isinstance(data.get("primary_ref"), str) and data["primary_ref"]:
        merged_params["primary_ref"] = data["primary_ref"]
        
    if isinstance(data.get("categories"), list) and data["categories"]:
        merged_params["categories"] = _normalize_category_list(data["categories"])

    if isinstance(data.get("priority_commentators"), list):
        merged_params["priority_commentators"] = list(dict.fromkeys(data["priority_commentators"]))[:3]

    if isinstance(data.get("concepts_for_external_search"), list):
        merged_params["concepts_for_external_search"] = list(dict.fromkeys(data["concepts_for_external_search"]))

    if not merged_params["primary_ref"]:
        logger.warning("Primary reference not found in LLM response, attempting fallback", extra={"event": "primary_ref_fallback"})
        fallback_ref = _extract_primary_ref_fallback(user_request)
        if fallback_ref:
            merged_params["primary_ref"] = fallback_ref
            logger.info("Found primary reference using fallback regex", extra={"event": "primary_ref_fallback_success", "ref": fallback_ref})
        else:
            logger.error("Could not find a primary reference in user request", extra={"event": "primary_ref_not_found"})

    if merged_params["primary_ref"]:
        primary_type = detect_primary_type(merged_params["primary_ref"])
        merged_params["primary_type"] = primary_type
        flow = STUDY_FLOWS.get(primary_type, [])
        
        if not merged_params["categories"]:
            logger.info(f"No categories returned from LLM. Applying default study flow for type '{primary_type}': {flow[:3]}")
            merged_params["categories"] = flow[:3]
        # If categories were returned by the LLM, we trust them (they are already normalized).
        # The previous logic was too restrictive and would discard valid categories if they weren't in the default flow.

    if merged_params.get("primary_ref") and ("Shulchan Arukh" in merged_params["primary_ref"] or "Shulchan Aruch" in merged_params["primary_ref"]):
        override_commentators = [
            "Magen Avraham", "Taz", "Eliyah Rabbah", "Be’er Heitev", "Pri Megadim",
            "Kaf HaChayim", "Mishnah Berurah", "Sha’arei Teshuvah", "Ba’er Hetev"
        ]
        merged_params["priority_commentators"] = override_commentators
        logger.info("Plan override applied for Shulchan Arukh", extra={
            "event": "plan_override",
            "trigger_ref_type": "Halakhah",
            "new_commentators_count": len(override_commentators)
        })

    logger.info("Final research plan created", extra={"event": "final_plan_created", "plan": merged_params})
    return merged_params


def _normalize_category_list(value: Any) -> List[str]:
    if isinstance(value, list):
        raw_items = value
    elif value:
        raw_items = [value]
    else:
        raw_items = []

    normalized: List[str] = []
    seen = set()
    for item in raw_items:
        tokens: List[str] = []
        if isinstance(item, str):
            tokens = [tok.strip() for tok in _CATEGORY_SPLIT_RE.split(item) if tok.strip()]
        elif isinstance(item, list):
            tokens = [tok.strip() for tok in item if isinstance(tok, str)]
        if not tokens and item:
            tokens = [str(item).strip()]
        for token in tokens:
            cleaned = token.strip()
            if not cleaned:
                continue
            canonical = _CATEGORY_CANONICAL_MAP.get(cleaned.lower())
            if not canonical or canonical in seen:
                continue
            seen.add(canonical)
            normalized.append(canonical)
    return normalized
