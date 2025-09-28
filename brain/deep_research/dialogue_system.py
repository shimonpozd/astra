#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Система внутреннего диалога для углубления исследования.
Генерирует вопросы и критику для улучшения качества исследования.
"""

import logging
import json
import re
from typing import Any, Dict, List, Optional
import asyncio

from ..llm_config import get_llm_for_task, LLMConfigError
from config.prompts import get_prompt

logger = logging.getLogger(__name__)

# --- Helper Functions ---

def _find_json_block(text: str) -> Optional[str]:
    """
    Finds a JSON block in a string using a list of regex patterns, from most to least specific.
    """
    json_patterns = [
        r'```json\s*(\{.*\})\s*```',  # Markdown code block
        r'(\{.*\})'                   # Most general case for a JSON object
    ]
    
    for pattern in json_patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            return match.group(1)
            
    return None

def _extract_from_text(text: str, type: str) -> List[Dict[str, str]]:
    """Fallback to extract structured data from unstructured text."""
    items = []
    lines = text.split('\n')
    key_name = "question" if type == "questions" else "criticism"
    
    for line in lines:
        line = line.strip()
        clean_line = re.sub(r'^[\s\d\-\*\]+\s*', '', line).strip()
        if clean_line and len(clean_line) > 15:
            priority = "Medium"
            if "high priority" in line.lower():
                priority = "High"
            elif "low priority" in line.lower():
                priority = "Low"
            items.append({"priority": priority, key_name: clean_line})
            
    return items[:5]

# --- Core Functions ---

async def generate_internal_questions(
    research_info: Dict[str, Any],
    plan: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """
    Analyzes the current findings and generates prioritized questions for the next iteration.
    """
    logger.info("🧠 Asking META_REASONER to generate clarifying questions...", extra={"event": "meta_reasoner_started"})
    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("META_REASONER")
    except LLMConfigError as e:
        logger.error(f"Could not get LLM for Meta-Reasoner: {e}")
        return []

    system_prompt = get_prompt("deep_research.system")
    if not system_prompt:
        logger.error("deep_research.system prompt not found or failed to load. Aborting question generation.")
        return []

    plan_focus = plan.get("primary_ref", "the main topic") if plan else "the main topic"
    guiding_questions = ", ".join(plan.get("questions", [])) if plan else "not specified"
    
    formatted_system_prompt = system_prompt.format(
        plan_focus=plan_focus,
        guiding_questions=guiding_questions
    )

    context_for_llm = {
        "plan": plan,
        "primary_summary": research_info.get("primary_summary"),
        "supporting_summary": research_info.get("supporting_summary"),
        "commentary_summary": research_info.get("commentary_summary"),
        "notes_preview": [note.get("summary") for note in research_info.get("notes", [])[:5]],
    }

    user_prompt = json.dumps(context_for_llm, indent=2, ensure_ascii=False)

    try:
        api_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": formatted_system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            **reasoning_params,
        }
        
        if "json_mode" in capabilities:
            api_params["response_format"] = {"type": "json_object"}

        raw_response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        content = raw_response.choices[0].message.content or ""
        
        cleaned_content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        json_candidate = _find_json_block(cleaned_content)

        if not json_candidate:
            logger.error(f"Failed to find JSON block in internal questions response: {content}")
            return _extract_from_text(content, "questions")

        data = json.loads(json_candidate)
        questions = data.get("questions", [])
        if isinstance(questions, list):
            logger.info(f"✓ META_REASONER generated {len(questions)} questions.", extra={"event": "meta_reasoner_finished", "question_count": len(questions)})
            return questions
        return []
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON from internal questions: {json_candidate}")
        return _extract_from_text(content, "questions")
    except Exception as e:
        logger.error(f"LLM call or processing failed in generate_internal_questions: {e}", exc_info=True)
        return []

async def critique_draft(
    draft: str,
    research_info: Dict[str, Any],
    plan: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """
    Analyzes a draft and generates prioritized critical feedback for improvement.
    ИСПРАВЛЕНО: Correctly handles fallback drafts and uses improved JSON parsing.
    """
    logger.info("🧐 Asking CRITIC to review the draft...", extra={"event": "critic_started"})
    if not draft:
        return []

    # КРИТИЧНО: If this is a fallback draft, don't try to critique it.
    if ("Could not generate a draft" in draft or 
        "no research notes were available" in draft or
        "system_fallback" in draft):
        logger.info("Detected fallback draft, returning specific feedback for data collection issues")
        return [
            {"priority": "High", "criticism": "The primary reference could not be found in Sefaria. Please verify the correct format."},
            {"priority": "High", "criticism": "No sources were collected for analysis. Check if the reference format is correct."},
            {"priority": "Medium", "criticism": "Try using the full title format (e.g., 'Shulchan Arukh, Orach Chayim 272:4' instead of 'Orach Chayim 272:4')"}
        ]

    try:
        client, model, reasoning_params, capabilities = get_llm_for_task("CRITIC")
    except LLMConfigError as e:
        logger.error(f"Could not get LLM for Critic: {e}")
        return []

    critic_system_prompt = get_prompt("deep_research.critic")
    if not critic_system_prompt:
        logger.error("CRITIC system prompt not found or failed to load. Aborting critique.")
        return []

    context_for_llm = {
        "plan": plan,
        "research_summary": {
            "primary_sources": research_info.get("primary_summary"),
            "commentaries": research_info.get("commentary_summary"),
            "notes_preview": [note.get("summary") for note in research_info.get("notes", [])[:10]], 
        },
        "draft_to_review": draft[:2000]
    }

    user_prompt = json.dumps(context_for_llm, indent=2, ensure_ascii=False)

    try:
        api_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": critic_system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            **reasoning_params,
        }
        
        if "json_mode" in capabilities:
            api_params["response_format"] = {"type": "json_object"}
        
        raw_response = await asyncio.to_thread(client.chat.completions.create, **api_params)
        content = raw_response.choices[0].message.content or ""
        
        cleaned_content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        json_candidate = _find_json_block(cleaned_content)

        if not json_candidate:
            logger.error(f"Failed to find JSON block in critique response: {content}")
            return _extract_from_text(content, "feedback")

        data = json.loads(json_candidate)
        feedback = data.get("feedback", [])
        if isinstance(feedback, list):
            logger.info(f"✓ CRITIC provided {len(feedback)} feedback points.", extra={"event": "critic_finished", "feedback_count": len(feedback)})
            logger.debug(f"CRITIC feedback: {feedback}")
            return feedback
        return []
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON from critique: {json_candidate}")
        return _extract_from_text(content, "feedback")
    except Exception as e:
        logger.error(f"LLM call or processing failed in critique_draft: {e}", exc_info=True)
        return []
