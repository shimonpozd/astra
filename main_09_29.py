import logging_utils
import logging
import os
import json
import time
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, AsyncGenerator, Tuple
import re
from collections import defaultdict

import html

import httpx
import uvicorn
import redis.asyncio as redis
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, HTTPException, Response, status, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from openai.types.chat import ChatCompletionChunk

from .llm_config import get_llm_for_task, LLMConfigError, reload_llm_config
from .sefaria_client import sefaria_get_text_v3_async, sefaria_get_related_links_async
from .sefaria_index import load_toc, resolve_book_name, get_bookshelf_categories
from .document_export import AUTO_EXPORT_ENABLED, export_plain_document
from .deep_research.orchestrator import prepare_deepresearch_payload, _generate_research_draft
from .settings import (
    REDIS_URL,
    MEMORY_SERVICE_URL,
    ITERATION_MAX,
)
from .deep_research.dialogue_system import critique_draft, generate_internal_questions
from .deep_research.progress_analyzer import ResearchCompletenessChecker
from .memory_client import store_chunks_in_memory
from .chunker import chunk_text
from .research_planner import parse_initial_request
from .deep_research.orchestrator import _create_source_event_payload
from .state import state, Session, Message
from .study_utils import detect_collection, get_text_with_window, get_bookshelf_for
from .study_state import (
    push_new_snapshot, get_current_snapshot, move_cursor, restore_by_index, 
    update_local_chat, StudySnapshot, replace_top_snapshot, Bookshelf, BookshelfItem
)
from .tts_client import get_tts_client
from config import get_config, update_config, CONFIG_CHANNEL, get_config_section
from config.prompts import get_prompt

logger = logging_utils.get_logger("brain-service", service="brain")

# Filter out /health health checks from logs
class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/health") == -1

logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

# --- CONFIG & APP SETUP ---
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
app = FastAPI(title="Brain Service", version="23.0.0")

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"type": "error", "data": {"message": "An internal server error occurred."}})

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

async def config_update_listener():
    """Listens for config update messages and triggers a reload."""
    if not state.redis_client:
        logger.warning("Redis client not available, config hot-reload is disabled.")
        return

    logger.info("Starting config update listener...")
    try:
        pubsub = state.redis_client.pubsub()
        await pubsub.subscribe(CONFIG_CHANNEL)
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=None)
            if message and message.get("data") == b"config_updated":
                logger.info("Received config update notification. Reloading configuration...")
                get_config(force_reload=True)
                reload_llm_config()
                logger.info("Configuration reloaded successfully.")
    except asyncio.CancelledError:
        logger.info("Config update listener cancelled.")
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Redis connection lost in config listener: {e}. Hot-reload will not work.")
    except Exception as e:
        logger.error(f"Error in config update listener: {e}", exc_info=True)

@app.on_event("startup")
async def startup_event():
    try:
        state.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await state.redis_client.ping()
        # Start the config listener as a background task
        asyncio.create_task(config_update_listener())
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Redis connection failed: {e}")
        state.redis_client = None
    await load_toc()

# --- SHARED HELPERS ---
def _compact_tool_payload(name: str, data: Any) -> Any:
    return data

# --- LEGACY SESSION & CHAT ---
class ChatRequest(BaseModel):
    text: str
    user_id: str
    session_id: Optional[str] = None
    agent_id: Optional[str] = None

async def get_session_from_redis(session_id: str, user_id: str, agent_id: str) -> Session:
    session_key = (user_id, agent_id, session_id)
    if session_key in state.sessions:
        return state.sessions[session_key]
    if state.redis_client:
        redis_key = f"session:{session_id}"
        session_data = await state.redis_client.get(redis_key)
        if session_data:
            session = Session.from_dict(json.loads(session_data))
            if agent_id and session.agent_id != agent_id:
                session.agent_id = agent_id
            state.sessions[session_key] = session
            return session
    session = Session(user_id=user_id, agent_id=agent_id, persistent_session_id=session_id)
    state.sessions[session_key] = session
    return session

async def save_session_to_redis(session: Session):
    if not state.redis_client: return
    redis_key = f"session:{session.persistent_session_id}"
    session.last_modified = datetime.now().isoformat()
    await state.redis_client.set(redis_key, json.dumps(session.to_dict()), ex=timedelta(days=7))

# --- DEEP RESEARCH FLOW ---
async def run_deep_research_flow(request: ChatRequest, initial_messages: List[Dict[str, Any]], session: Session, personality_config: Dict[str, Any]) -> AsyncGenerator[str, None]:
    memory_service_url = MEMORY_SERVICE_URL
    if not memory_service_url:
        memory_service_url = os.getenv("MEMORY_SERVICE_URL")
    if not memory_service_url:
        yield json.dumps({"type": "error", "data": {"message": "MEMORY_SERVICE_URL is not configured."}})
        return

    yield json.dumps({"type": "status", "data": {"message": "Starting deep research..."}})
    try:
        plan = await parse_initial_request({"user_request": request.text})
        if not plan.get("primary_ref"):
            yield json.dumps({"type": "error", "data": {"message": "Could not determine a primary reference."}})
            return
        
        session.last_research_plan = plan
        session.seen_refs = set()
        yield json.dumps({"type": "plan", "data": {"iteration": 1, **plan}})

        final_research_info = {}
        accumulated_notes = []
        max_iterations = max(1, ITERATION_MAX)

        for i in range(1, max_iterations + 1):
            yield json.dumps({"type": "status", "data": {"message": f"--- Research Iteration {i}/{max_iterations} ---"}})
            
            payload_task = asyncio.create_task(prepare_deepresearch_payload(
                prompt=request.text, user_id=session.user_id, session_id=session.persistent_session_id,
                agent_id=session.agent_id, collection_base=f"user_{session.user_id}",
                memory_service_url=memory_service_url, plan=plan, per_study_collection=True,
                seen_refs=session.seen_refs, stream_event_callback=None
            ))
            research_info, processed_refs, _, note_chunks = await payload_task

            if not research_info:
                raise Exception("Payload preparation failed.")

            session.seen_refs.update(processed_refs)
            session.last_research_collection = research_info.get("collection")
            
            if note_chunks:
                serializable_notes = [{"text": chunk.text, "index": chunk.index} for chunk in note_chunks]
                accumulated_notes.extend(serializable_notes)
                research_info["notes"] = serializable_notes
            
            final_research_info = research_info
            yield json.dumps({"type": "research_info", "data": {"iteration": i, **research_info}})

            if research_info.get("chunks_stored", 0) > 0 or research_info.get("notes"):
                draft_result = await _generate_research_draft(research_info, plan, is_final=False)
                if draft_result and draft_result.get("draft"):
                    research_info["draft"] = draft_result.get("draft")

            completeness_checker = ResearchCompletenessChecker()
            completeness_check = completeness_checker.check_completeness(research_info, i, max_iterations)
            yield json.dumps({"type": "completeness_check", "data": {"iteration": i, **completeness_check}})

            if not completeness_check["should_continue"]: break

        yield json.dumps({"type": "status", "data": {"message": "Final synthesis..."}})
        if final_research_info:
            final_research_info["notes"] = accumulated_notes
            final_draft_result = await _generate_research_draft(final_research_info, session.last_research_plan, is_final=True)
            if final_draft_result and final_draft_result.get("draft"):
                yield json.dumps({"type": "final_draft", "data": final_draft_result})
                if AUTO_EXPORT_ENABLED:
                    export_plain_document(user_id=session.user_id, agent_id=session.agent_id, prompt=request.text, response=final_draft_result.get("draft", ""), metadata={})
            else:
                yield json.dumps({"type": "error", "data": {"message": "Failed to generate final draft."}})
        else:
            yield json.dumps({"type": "error", "data": {"message": "No research data for synthesis."}})

    except Exception as e:
        logger.error("Error in deep research flow: %s", e, exc_info=True)
        yield json.dumps({"type": "error", "data": {"message": f"An error occurred: {e}"}})

# --- UNIFIED LLM STREAM & LEGACY CHAT ---
async def get_llm_response_stream(
    messages: List[Dict[str, Any]],
    personality_config: Dict[str, Any],
    user_id: str,
    session_id: str, 
    agent_id: str,
    default_research_collection: Optional[str] = None,
    session_for_memory: Optional[Session] = None,
) -> AsyncGenerator[Tuple[str, Any], None]:
    try:
        client, model, reasoning_params, _ = get_llm_for_task("CHAT")
    except LLMConfigError as e:
        yield ("error", f"Error: LLM not configured for this task. {e}")
        return

    use_sefaria_tools = personality_config.get("use_sefaria_tools", False)
    tools = []
    if use_sefaria_tools:
        tools.extend([
            {"type": "function", "function": {"name": "update_commentators_panel", "description": "Displays a list of commentators and related texts on the user's side panel for easy access.", "parameters": {"type": "object", "properties": {"reference": {"type": "string", "description": "The primary source reference, e.g., 'Shabbat 21a'"}, "commentators": {"type": "array", "items": {"type": "object"}, "description": "The list of commentator objects to display."}},"required": ["reference", "commentators"]}}},            {"type": "function", "function": {"name": "sefaria_get_text_v3", "description": "Get a specific text segment or commentary by its reference (ref).", "parameters": {"type": "object", "properties": {"tref": {"type": "string", "description": "The text reference, e.g., 'Genesis 1:1' or 'Rashi on Genesis 1:1:1'"}}, "required": ["tref"]}}},            {"type": "function", "function": {"name": "sefaria_get_related_links", "description": "Get related links (multiple categories) for a ref; useful to discover commentators before fetching texts.", "parameters": {"type": "object", "properties": {"ref": {"type": "string"},"categories": {"type": "array", "items": {"type": "string"}}},"required": ["ref"]}}},        ])

    api_params = {**reasoning_params, "model": model, "messages": messages, "stream": True}
    if tools: 
        api_params.update({"tools": tools, "tool_choice": "auto"})

    iter_count = 0
    while iter_count < 5:
        iter_count += 1
        stream = client.chat.completions.create(**api_params)
        tool_call_builders = defaultdict(lambda: {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
        full_reply_content = ""
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.tool_calls:
                for tc in delta.tool_calls:
                    builder = tool_call_builders[tc.index]
                    if tc.id: builder["id"] = tc.id
                    if tc.function:
                        if tc.function.name: builder["function"]["name"] = tc.function.name
                        if tc.function.arguments: builder["function"]["arguments"] += tc.function.arguments
            elif delta and delta.content:
                # More robustly filter out any HTML-like tags and decode entities, handling potential double-encoding
                stripped_tags = re.sub(r'<[^>]+>', '', delta.content)
                # First pass for entities like &amp;#39;
                temp_unescape = html.unescape(stripped_tags)
                # Second pass for the resulting &#39;
                clean_content = html.unescape(temp_unescape)
                
                if not clean_content:
                    continue
                
                full_reply_content += clean_content
                yield ("llm_chunk", clean_content)
        
        if not tool_call_builders:
            yield ("full_response", full_reply_content)
            return 
        
        full_tool_calls = [v for _, v in sorted(tool_call_builders.items())]
        messages.append({"role": "assistant", "tool_calls": full_tool_calls, "content": full_reply_content or None})
        
        for tool_call in full_tool_calls:
            function_name = tool_call["function"]["name"]
            try:
                function_args = json.loads(tool_call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                function_args = {}

            result = {"ok": False, "error": f"unknown tool {function_name}"}

            if function_name == "sefaria_get_text_v3":
                tref = function_args.get("tref")
                final_text_data = None
                result = None
                en_result = await sefaria_get_text_v3_async(tref=tref)
                if en_result.get("ok") and en_result.get("data", {}).get("text"):
                    final_text_data = en_result["data"]
                    result = en_result
                else:
                    he_result = await sefaria_get_text_v3_async(tref=tref, lang='he')
                    if he_result.get("ok"):
                        final_text_data = he_result.get("data")
                    result = he_result
                if final_text_data:
                    yield ("source_event", _create_source_event_payload(final_text_data))
                    if session_for_memory and default_research_collection:
                        memory_service_url = MEMORY_SERVICE_URL
                        if not memory_service_url:
                            memory_service_url = os.getenv("MEMORY_SERVICE_URL")
                        if memory_service_url:
                            text_to_chunk = final_text_data.get("text", "")
                            if text_to_chunk:
                                chunks_for_memory = chunk_text(text_to_chunk)
                                metadata = {"source_ref": final_text_data.get("ref")}
                                
                                # Fire and forget
                                asyncio.create_task(store_chunks_in_memory(
                                    base_url=memory_service_url,
                                    collection=default_research_collection,
                                    user_id=session_for_memory.user_id,
                                    session_id=session_for_memory.persistent_session_id,
                                    agent_id=session_for_memory.agent_id,
                                    chunks=chunks_for_memory,
                                    metadata=metadata
                                ))

            elif function_name == "sefaria_get_related_links":
                result = await sefaria_get_related_links_async(**function_args)

            elif function_name == "update_commentators_panel":
                yield ("structured_event", {"type": "commentators_panel_update", "data": function_args})
                result = {"ok": True, "message": "Panel update event sent."}

            payload_json = json.dumps(result.get("data", result), ensure_ascii=False)
            messages.append({"tool_call_id": tool_call["id"], "role": "tool", "name": function_name, "content": payload_json})
        
        api_params["messages"] = messages

from .doc_v1_models import DocV1, ParagraphBlock

async def process_chat_stream(request: ChatRequest, background_tasks: BackgroundTasks):
    logger.info(f"--- New Chat Request ---")
    logger.info(f"Session ID: {request.session_id}, Agent ID: {request.agent_id}, Text: {request.text}")
    session = await get_session_from_redis(request.session_id or str(uuid.uuid4()), request.user_id, request.agent_id or "default")
    
    # Use the new personality service instead of the old state
    personality_config = personality_service.get_personality(session.agent_id) or {}
    
    if not session.name and not session.short_term_memory:
        session.name = request.text[:50]

    session.add_message(role="user", content=request.text)

    flow_type = personality_config.get("flow", "conversational")
    if request.text.startswith("/research"): flow_type = "deep_research"

    if flow_type == "deep_research":
        async for chunk in run_deep_research_flow(request, [], session, personality_config):
            yield chunk
    elif flow_type == "talmud_json":
        # Special handling for talmud JSON responses
        system_prompt = personality_config.get("system_prompt", "")
        prompt_messages = [{"role": "system", "content": system_prompt}] + [m.model_dump() for m in session.short_term_memory]
        full_response = ""
        stream = get_llm_response_stream(
            messages=prompt_messages, personality_config=personality_config, user_id=session.user_id,
            session_id=session.persistent_session_id, agent_id=session.agent_id,
            default_research_collection=session.last_research_collection, session_for_memory=session
        )
        async for event_type, event_data in stream:
            if event_type == "llm_chunk":
                full_response += event_data
                yield json.dumps({"type": "llm_chunk", "data": event_data}) + '\n'
            else:
                yield json.dumps(event_data) + '\n'

        # For talmud_json, try to parse the response as JSON and wrap it properly
        if full_response.strip():
            try:
                # Try to parse as JSON first
                parsed = json.loads(full_response.strip())
                # If it's already a Doc format, wrap it in a message
                if isinstance(parsed, dict) and "doc" in parsed:
                    session.add_message(role="assistant", content=json.dumps(parsed, ensure_ascii=False))
                else:
                    # If it's not Doc format, create a simple paragraph block
                    doc = {
                        "version": "1.0",
                        "blocks": [{"type": "paragraph", "text": full_response.strip()}]
                    }
                    session.add_message(role="assistant", content=json.dumps(doc, ensure_ascii=False))
            except json.JSONDecodeError:
                # If not valid JSON, create a simple paragraph block
                doc = {
                    "version": "1.0",
                    "blocks": [{"type": "paragraph", "text": full_response.strip()}]
                }
                session.add_message(role="assistant", content=json.dumps(doc, ensure_ascii=False))
    else:
        system_prompt = personality_config.get("system_prompt", "")
        prompt_messages = [{"role": "system", "content": system_prompt}] + [m.model_dump() for m in session.short_term_memory]
        full_response = ""
        stream = get_llm_response_stream(
            messages=prompt_messages, personality_config=personality_config, user_id=session.user_id,
            session_id=session.persistent_session_id, agent_id=session.agent_id,
            default_research_collection=session.last_research_collection, session_for_memory=session
        )
        async for event_type, event_data in stream:
            if event_type == "llm_chunk":
                full_response += event_data
                yield json.dumps({"type": "llm_chunk", "data": event_data}) + '\n'
            else:
                yield json.dumps(event_data) + '\n'
        if full_response.strip():
            session.add_message(role="assistant", content=full_response.strip())

    yield json.dumps({"type": "end", "data": "Stream finished"}) + '\n'
    background_tasks.add_task(save_session_to_redis, session)

@app.post("/chat/stream")
async def chat_stream_handler(request: ChatRequest, background_tasks: BackgroundTasks):
    return StreamingResponse(process_chat_stream(request, background_tasks), media_type="application/x-ndjson")

@app.get("/chats")
async def get_chats():
    if not state.redis_client:
        logger.warning("Redis client not available")
        return []

    logger.info("Fetching all chats and study sessions...")
    all_sessions = []
    
    # 1. Fetch regular chat sessions
    try:
        async for key in state.redis_client.scan_iter("session:*"):
            session_data = await state.redis_client.get(key)
            if not session_data:
                continue
            try:
                session = json.loads(session_data)
                if isinstance(session, dict) and "persistent_session_id" in session:
                    all_sessions.append({
                        "session_id": session.get("persistent_session_id"),
                        "name": session.get("name", "Chat"),
                        "last_modified": session.get("last_modified"),
                        "type": "chat"
                    })
            except json.JSONDecodeError:
                logger.warning(f"Failed to decode JSON for chat key {key}, skipping.")
                continue
    except Exception as e:
        logger.error(f"An error occurred while scanning for chat sessions: {e}", exc_info=True)

    # 2. Fetch study sessions
    try:
        study_keys = []
        async for key in state.redis_client.scan_iter("study:sess:*:top"):
            study_keys.append(key)
        logger.info(f"Found {len(study_keys)} study session keys: {study_keys}")

        for key in study_keys:
            session_data = await state.redis_client.get(key)
            if not session_data:
                logger.warning(f"No data for study key {key}")
                continue
            try:
                # The key is study:sess:{session_id}:top
                session_id = key.split(':')[2]
                snapshot = json.loads(session_data)
                logger.info(f"Processing study session {session_id}: {snapshot.get('focus', {}).get('title', 'No title')}")
                if isinstance(snapshot, dict) and "focus" in snapshot:
                    study_session = {
                        "session_id": session_id,
                        "name": snapshot.get("focus", {}).get("title", "Study Session"),
                        "last_modified": datetime.fromtimestamp(snapshot.get("ts", 0)).isoformat(),
                        "type": "study"
                    }
                    all_sessions.append(study_session)
                    logger.info(f"Added study session: {study_session}")
            except (json.JSONDecodeError, IndexError) as e:
                logger.warning(f"Failed to process study session key {key}: {e}")
                continue
    except Exception as e:
        logger.error(f"An error occurred while scanning for study sessions: {e}", exc_info=True)

    # 3. Filter and sort the combined list
    sessions_with_date = [s for s in all_sessions if s.get("last_modified")]
    sessions_without_date = [s for s in all_sessions if not s.get("last_modified")]

    # Sort sessions with a date, most recent first
    sorted_sessions = sorted(sessions_with_date, key=lambda x: x["last_modified"], reverse=True)

    final_result = sorted_sessions + sessions_without_date
    logger.info(f"Returning {len(final_result)} total sessions: {len([s for s in final_result if s.get('type') == 'chat'])} chats, {len([s for s in final_result if s.get('type') == 'study'])} studies")

    return final_result

@app.get("/chats/{session_id}")
async def get_chat_history(session_id: str):
    if not state.redis_client: return {"history": []}
    session_data = await state.redis_client.get(f"session:{session_id}")
    if not session_data: return {"history": []}
    session_obj = Session.from_dict(json.loads(session_data))
    history = [msg.model_dump() for msg in session_obj.short_term_memory]
    return {"session_id": session_id, "history": history}

@app.delete("/sessions/{session_id}/{session_type}", status_code=204)
async def delete_session(session_id: str, session_type: str):
    logger.info(f"Delete session called: session_id={session_id}, session_type={session_type}")

    if not state.redis_client:
        logger.error("Redis client not available")
        raise HTTPException(status_code=503, detail="Redis client not available")

    if session_type == "chat":
        key_to_delete = f"session:{session_id}"
        logger.info(f"Deleting chat session: {key_to_delete}")
        result = await state.redis_client.delete(key_to_delete)
        logger.info(f"Deleted {result} chat keys")
    elif session_type == "study":
        history_key = f"study:sess:{session_id}:history"
        cursor_key = f"study:sess:{session_id}:cursor"
        top_key = f"study:sess:{session_id}:top"
        logger.info(f"Deleting study session keys: {history_key}, {cursor_key}, {top_key}")
        result = await state.redis_client.delete(history_key, cursor_key, top_key)
        logger.info(f"Deleted {result} study keys")
    else:
        logger.error(f"Unknown session type: {session_type}")
        raise HTTPException(status_code=400, detail=f"Unknown session type: {session_type}")

    logger.info(f"Successfully deleted {session_type} session {session_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- STUDY DESK ENDPOINTS ---

class StudyBookshelfRequest(BaseModel):
    session_id: str
    ref: str
    categories: List[str]

@app.get("/study/categories")
async def study_get_categories_handler():
    return get_bookshelf_categories()

@app.post("/study/bookshelf")
async def study_get_bookshelf_handler(request: StudyBookshelfRequest):
    bookshelf_data = await get_bookshelf_for(request.ref, categories=request.categories)

    if request.session_id:
        snapshot = await get_current_snapshot(request.session_id)
        if snapshot:
            try:
                snapshot.bookshelf = Bookshelf(**bookshelf_data)
            except Exception as exc:
                logger.error("Failed to attach refreshed bookshelf to snapshot %s: %s", request.session_id, exc, exc_info=True)
            else:
                updated = await replace_top_snapshot(request.session_id, snapshot)
                if not updated:
                    logger.warning("Could not persist refreshed bookshelf for study session %s", request.session_id)
    return bookshelf_data

class StudyResolveRequest(BaseModel):
    text: str

class StudyResolveResponse(BaseModel):
    ok: bool
    ref: Optional[str] = None
    collection: Optional[str] = None
    title: Optional[str] = None
    candidates: Optional[List[Dict[str, str]]] = None

class StudySetFocusRequest(BaseModel):
    session_id: str
    ref: str
    window_size: Optional[int] = 5
    navigation_type: str = "drill_down" # 'drill_down' or 'advance'

class StudyStateResponse(BaseModel):
    ok: bool
    state: Optional[StudySnapshot] = None

class StudyNavigateRequest(BaseModel):
    session_id: str

class StudyRestoreRequest(BaseModel):
    session_id: str
    index: int

class StudyChatRequest(BaseModel):
    session_id: str
    text: str

class StudyWorkbenchSetRequest(BaseModel):
    session_id: str
    slot: str  # "left" or "right"
    ref: Optional[str] = None

class StudyChatSetFocusRequest(BaseModel):
    session_id: str
    ref: str

REF_REGEX = re.compile(r"(?P<book>.+?)\s+(?P<ref>\d+[ab]?[.:].*)", re.IGNORECASE)

@app.post("/study/resolve", response_model=StudyResolveResponse)
async def study_resolve_handler(request: StudyResolveRequest):
    match = REF_REGEX.match(request.text.strip())
    if not match:
        return {"ok": False, "candidates": []}
    book_name_str = match.group('book').strip()
    ref_part_str = (match.group('ref') or '').strip()
    canonical_book = await resolve_book_name(book_name_str)
    if not canonical_book:
        return {"ok": False, "candidates": []}
    collection = detect_collection(canonical_book)
    final_ref = f"{canonical_book} {ref_part_str}".strip()
    test_result = await sefaria_get_text_v3_async(final_ref)
    if not test_result.get("ok"):
        return {"ok": False, "candidates": []}
    return {"ok": True, "ref": final_ref, "collection": collection, "title": test_result.get("data", {}).get("indexTitle")}

@app.post("/study/set_focus", response_model=StudyStateResponse)
async def study_set_focus_handler(request: StudySetFocusRequest):
    # logger.info(f"Creating study session for ref: {request.ref}, session_id: {request.session_id}")
    try:
        window_task = get_text_with_window(request.ref, request.window_size)
        bookshelf_task = get_bookshelf_for(request.ref)
        window_data, bookshelf_data = await asyncio.gather(window_task, bookshelf_task)
        if not window_data:
            raise HTTPException(status_code=404, detail=f"Reference not found: {request.ref}")
    except Exception as e:
        logger.error(f"Failed to fetch data for reference {request.ref}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch data for the requested reference.")

    snapshot = StudySnapshot(
        focus=window_data['focus'],
        window=window_data['window'],
        bookshelf=Bookshelf(**bookshelf_data),
        chat_local=[],
        ts=int(datetime.now().timestamp()),
        discussion_focus_ref=window_data['focus']['ref'] # Set chat focus to the main text
    )

    logger.info(f"Created snapshot with title: {snapshot.focus.title}")

    if request.navigation_type == 'advance':
        success = await replace_top_snapshot(request.session_id, snapshot)
    else: # Default to drill_down
        success = await push_new_snapshot(request.session_id, snapshot)

    if not success:
        logger.error(f"Failed to save snapshot to Redis for session {request.session_id}")
        raise HTTPException(status_code=500, detail="Failed to save new state to Redis.")

    logger.info(f"Successfully saved study session {request.session_id}")
    return {"ok": True, "state": snapshot}

@app.post("/study/back", response_model=StudyStateResponse)
async def study_back_handler(request: StudyNavigateRequest):
    new_snapshot = await move_cursor(request.session_id, -1)
    if not new_snapshot:
        raise HTTPException(status_code=400, detail="Cannot move back.")
    return {"ok": True, "state": new_snapshot}

@app.post("/study/forward", response_model=StudyStateResponse)
async def study_forward_handler(request: StudyNavigateRequest):
    new_snapshot = await move_cursor(request.session_id, 1)
    if not new_snapshot:
        raise HTTPException(status_code=400, detail="Cannot move forward.")
    return {"ok": True, "state": new_snapshot}

@app.post("/study/restore", response_model=StudyStateResponse)
async def study_restore_handler(request: StudyRestoreRequest):
    new_snapshot = await restore_by_index(request.session_id, request.index)
    if not new_snapshot:
        raise HTTPException(status_code=400, detail="Invalid index.")
    return {"ok": True, "state": new_snapshot}

@app.post("/study/workbench/set", response_model=StudyStateResponse)
async def study_workbench_set_handler(request: StudyWorkbenchSetRequest):
    if request.slot not in ["left", "right"]:
        raise HTTPException(status_code=400, detail="Invalid slot specified.")

    snapshot = await get_current_snapshot(request.session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No active study session found.")

    # Find the item in the current bookshelf and load full text
    item_to_add = None
    if request.ref:
        found = False
        for item in snapshot.bookshelf.items:
            if item.ref == request.ref:
                item_to_add = item
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Item not found in current bookshelf.")

        # Load full text for the item
        # logger.info(f"Loading full text for workbench item: {request.ref}")
        # try:
        #     text_result = await sefaria_get_text_v3_async(request.ref)
        #     logger.info(f"Text result for {request.ref}: ok={text_result.get('ok')}, has_text={bool(text_result.get('data', {}).get('text'))}")
        #     if text_result.get("ok") and text_result.get("data", {}).get("text"):
        #         text_data = text_result["data"]
        #         logger.info(f"Loaded text data: title={text_data.get('title')}, text_length={len(text_data.get('text', ''))}")
        #         # Create new item with full text
        #         item_dict = item_to_add.model_dump()
        #         item_dict["text_full"] = text_data.get("text", "")
        #         item_dict["heTextFull"] = text_data.get("he", "") if text_data.get("he") else text_data.get("text", "")
        #         item_dict["title"] = text_data.get("title", item_dict.get("title"))
        #         item_dict["heTitle"] = text_data.get("heTitle", item_dict.get("heTitle"))
        #         item_to_add = BookshelfItem(**item_dict)
        #         logger.info(f"Created new BookshelfItem with full text for {request.ref}")
        #     else:
        #         logger.warning(f"No text found for {request.ref}, result: {text_result}")
        # except Exception as e:
        #     logger.error(f"Failed to load full text for {request.ref}: {e}", exc_info=True)
        #     # Continue with preview-only item

    snapshot.workbench[request.slot] = item_to_add
    
    success = await replace_top_snapshot(request.session_id, snapshot)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save state.")
    
    return {"ok": True, "state": snapshot}

@app.post("/study/chat/set_focus", response_model=StudyStateResponse)
async def study_chat_set_focus_handler(request: StudyChatSetFocusRequest):
    snapshot = await get_current_snapshot(request.session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No active study session found.")

    # Update discussion focus
    snapshot.discussion_focus_ref = request.ref

    # IMPORTANT: Update bookshelf based on the new focus
    try:
        new_bookshelf = await get_bookshelf_for(request.ref)
        snapshot.bookshelf = Bookshelf(**new_bookshelf)
    except Exception as e:
        logger.error(f"Failed to get bookshelf for new focus {request.ref}: {e}")
        # Decide if we should fail or continue with the old bookshelf
        raise HTTPException(status_code=500, detail="Failed to update bookshelf for new focus.")

    success = await replace_top_snapshot(request.session_id, snapshot)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save state.")

    return {"ok": True, "state": snapshot}

async def study_chat_stream_processor(request: StudyChatRequest, background_tasks: BackgroundTasks):
    # logger.info(f"--- New Study Chat Request ---")
    # logger.info(f"Session ID: {request.session_id}, Text: {request.text}")

    snapshot_obj = await get_current_snapshot(request.session_id)
    if not snapshot_obj:
        logger.error("No active study session found.")
        yield json.dumps({"type": "error", "data": {"message": "No active study session found."}}) + '\n'
        return

    if not isinstance(snapshot_obj, dict):
        snapshot = snapshot_obj.model_dump()
    else:
        snapshot = snapshot_obj

    # Get context settings from config
    context_setting = get_config_section("actions.context.study_mode_context", "english_only")
    # logger.info(f"Study mode context setting: {context_setting}")

    discussion_ref = snapshot.get("discussion_focus_ref")
    if not discussion_ref:
        discussion_ref = snapshot.get("focus", {}).get("ref")
    
    # logger.info(f"Discussion ref: {discussion_ref}")

    english_context = ""
    hebrew_context = ""

    async def fetch_text(ref, lang):
        # Helper to fetch text and handle errors
        response = await sefaria_get_text_v3_async(ref, lang=lang)
        if response.get("ok") and response.get("data", {}).get("text"):
            return response["data"]["text"]
        return ""

    if context_setting == "english_only":
        english_context = await fetch_text(discussion_ref, 'en')
    elif context_setting == "hebrew_only":
        hebrew_context = await fetch_text(discussion_ref, 'he')
    elif context_setting == "hebrew_and_english":
        # Fetch both concurrently
        en_task = fetch_text(discussion_ref, 'en')
        he_task = fetch_text(discussion_ref, 'he')
        english_context, hebrew_context = await asyncio.gather(en_task, he_task)

    # Prepare the combined context for the prompt
    # This part will be adjusted once the prompt itself is updated
    final_context = ""
    if english_context:
        final_context += f"English Text:\n---\n{english_context}\n\n"
    if hebrew_context:
        final_context += f"Hebrew Text:\n---\n{hebrew_context}\n"

    MAX_CONTEXT_CHARS = 15000
    truncated_context = final_context[:MAX_CONTEXT_CHARS]
    if len(final_context) > MAX_CONTEXT_CHARS:
        truncated_context += "\n... (context truncated)"

    agent_id = "chevruta_talmud"
    personality_config = personality_service.get_personality(agent_id) or {}
    # logger.info(f"Using personality: {agent_id}")

    system_prompt = personality_config.get("system_prompt", "")
    # Replace placeholders
    system_prompt = system_prompt.replace("{discussion_ref}", discussion_ref or "")
    system_prompt = system_prompt.replace("{truncated_context}", truncated_context or "") # This will be replaced later
    
    messages = [{"role": "system", "content": system_prompt}, *snapshot.get("chat_local", []), {"role": "user", "content": request.text}]

    # Preprocess messages for the LLM API
    processed_messages = []
    for msg_data in messages:
        processed_msg = msg_data.copy()
        # If content is a dictionary (DocV1), convert it to a JSON string
        if isinstance(processed_msg.get("content"), dict):
            processed_msg["content"] = json.dumps(processed_msg["content"], ensure_ascii=False)
        # Ensure content is not None
        elif processed_msg.get("content") is None:
            processed_msg["content"] = ""
        
        # Remove fields not expected by the LLM API
        processed_msg.pop("content_type", None)
        processed_msg.pop("tool_calls", None) # Assuming tool_calls are handled separately if needed
        processed_messages.append(processed_msg)

    full_response_chunks = []
    stream = get_llm_response_stream(messages=processed_messages, personality_config=personality_config, user_id="study_user", session_id=request.session_id, agent_id=agent_id)
    
    logger.info("Getting LLM response...")
    async for event_type, event_data in stream:
        if event_type == "llm_chunk":
            full_response_chunks.append(event_data)
        elif event_type == "error":
            logger.error(f"Error from LLM stream: {event_data}")
            yield json.dumps({"type": "error", "data": {"message": event_data}}) + '\n'
            return

    full_response = "".join(full_response_chunks)
    logger.info(f"LLM full_response: {full_response.strip()}")

    if full_response.strip():
        doc_v1_content = None
        try:
            parsed_json = json.loads(full_response.strip())
            logger.info("Successfully parsed LLM response as JSON.")
            doc_v1_content = DocV1.model_validate(parsed_json)
            logger.info("Successfully validated JSON as DocV1.")
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse or validate LLM response as DocV1: {e}")
            doc_v1_content = DocV1(
                blocks=[ParagraphBlock(type='paragraph', text=full_response.strip())]
            )
            logger.info("Created fallback DocV1 paragraph.")
        
        yield json.dumps({"type": "doc_v1", "data": doc_v1_content.model_dump()}) + '\n'
        logger.info(f"Yielded doc_v1 content: {doc_v1_content.model_dump_json(indent=2)}")

        new_messages = [
            {"role": "user", "content": request.text, "content_type": "text.v1"},
            {"role": "assistant", "content": doc_v1_content.model_dump(), "content_type": "doc.v1"}
        ]
        background_tasks.add_task(update_local_chat, request.session_id, new_messages)
        logger.info("Added new messages to local chat history.")
    
    yield json.dumps({"type": "end", "data": "Stream finished"}) + '\n'
    logger.info("--- Study Chat Request Finished ---")
@app.post("/study/chat")
async def study_chat_handler(request: StudyChatRequest, background_tasks: BackgroundTasks):
    return StreamingResponse(study_chat_stream_processor(request, background_tasks), media_type="application/x-ndjson")

@app.get("/study/state", response_model=StudyStateResponse)
async def study_get_state_handler(session_id: str):
    snapshot = await get_current_snapshot(session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No active study session found for the given ID.")
    return {"ok": True, "state": snapshot}

@app.get("/study/lexicon")
async def study_lexicon_handler(word: str):
    """
    Proxies requests to the Sefaria Lexicon API.
    """
    sefaria_url = f"https://www.sefaria.org/api/words/{word}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(sefaria_url)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
            return response.json()
        except httpx.HTTPStatusError as e:
            # Forward the error from Sefaria API if it's a client/server error
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Sefaria API: {e.response.text}")
        except httpx.RequestError as e:
            # Handle network-level errors
            raise HTTPException(status_code=503, detail=f"Could not connect to Sefaria API: {e}")


# --- Actions ---

class TranslateRequest(BaseModel):
    hebrew_text: str
    english_text: Optional[str] = None

@app.post("/actions/translate")
async def translate_handler(request: TranslateRequest):
    """
    Handles on-demand translation of a text fragment using an LLM.
    """
    log_text = request.english_text[:50] if request.english_text else request.hebrew_text[:50]
    logger.info(f"Received translation request for text: {log_text}...")
    logger.info(f"TRANSLATE_HANDLER: Received hebrew_text: '{request.hebrew_text[:100]}...'")
    logger.info(f"TRANSLATE_HANDLER: Received english_text: '{ (request.english_text or '')[:100]}...'")
    try:
        client, model, reasoning_params, _ = get_llm_for_task("TRANSLATOR") 
    except LLMConfigError as e:
        logger.error(f"LLM not configured for translation task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM not configured for this task: {e}")

    system_prompt = get_prompt("actions.translator_system")
    user_prompt_template = get_prompt("actions.translator_user_template")

    if not system_prompt or not user_prompt_template:
        logger.error("Translator system or user template prompt not found!")
        raise HTTPException(status_code=500, detail="Translator prompts not configured.")

    # Replace placeholders in the user prompt template
    user_prompt = user_prompt_template.replace("{hebrew_text}", request.hebrew_text)
    user_prompt = user_prompt.replace("{english_text}", request.english_text or "") # Pass empty string if no English text

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    logger.info(f"TRANSLATE_STREAM: Messages sent to LLM: {messages}")

    async def stream_llm_response():
        logger.info("TRANSLATE_STREAM: Starting LLM call")
        full_response_chunks = []
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                **reasoning_params
            )
            chunk_count = 0
            for chunk in stream:
                chunk_count += 1
                content = chunk.choices[0].delta.content
                # logger.info(f"TRANSLATE_STREAM: Received chunk {chunk_count}: '{content}'")
                if content:
                    full_response_chunks.append(content)
            logger.info(f"TRANSLATE_STREAM: Stream finished, total chunks: {chunk_count}")

            full_response = "".join(full_response_chunks)
            cleaned_translation = full_response

            logger.info(f"TRANSLATE_STREAM: Raw LLM response for cleanup: '{cleaned_translation[:200]}...'\n")

            # Attempt to parse as JSON
            try:
                parsed_json = json.loads(full_response)
                if isinstance(parsed_json, dict) and "translation" in parsed_json:
                    cleaned_translation = parsed_json["translation"]
                    logger.info("TRANSLATE_STREAM: Successfully extracted translation from JSON.")
                else:
                    logger.warning("TRANSLATE_STREAM: JSON parsed but 'translation' key not found or invalid.")
            except json.JSONDecodeError:
                logger.warning("TRANSLATE_STREAM: Full response is not valid JSON. Attempting heuristic cleanup.")
                # Heuristic cleanup for non-JSON responses (e.g., remove preambles/thoughts)
                # Remove Markdown code block fences
                logger.info(f"TRANSLATE_STREAM: Before regex cleanup: '{cleaned_translation[:200]}...'\n")
                cleaned_translation = cleaned_translation.replace('```', '')
                logger.info(f"TRANSLATE_STREAM: After backtick cleanup: '{cleaned_translation[:200]}...'\n")
                cleaned_translation = re.sub(r'^<think>.*?</think>\s*' , '', cleaned_translation, flags=re.DOTALL)
                cleaned_translation = re.sub(r'^Okay,.*?\n\n', '', cleaned_translation, flags=re.DOTALL)
                cleaned_translation = cleaned_translation.strip()

            yield json.dumps({"type": "llm_chunk", "data": cleaned_translation})

        except Exception as e:
            logger.error(f"TRANSLATE_STREAM: Error during stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "data": {"message": "Error: Could not get translation from LLM."}})

    return StreamingResponse(stream_llm_response(), media_type="text/event-stream")

class ExplainTermRequest(BaseModel):
    term: str
    context_text: str

@app.post("/actions/explain-term")
async def explain_term_handler(request: ExplainTermRequest):
    """
    Handles on-demand explanation of a term using Sefaria and an LLM.
    """
    logger.info(f"Received term explanation request for: {request.term}")

    # 1. Get definition from Sefaria
    sefaria_url = f"https://www.sefaria.org/api/words/{request.term}"
    sefaria_data = {}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(sefaria_url)
            response.raise_for_status()
            sefaria_data = response.json()
            logger.info(f"Successfully fetched data from Sefaria for term: {request.term}")
        except httpx.RequestError as e:
            logger.warning(f"Could not connect to Sefaria API for term {request.term}: {e}")
            sefaria_data = {"error": f"Could not connect to Sefaria API: {e}"}
        except httpx.HTTPStatusError as e:
            logger.warning(f"Sefaria API returned status {e.response.status_code} for term {request.term}")
            sefaria_data = {"error": f"Sefaria API returned status {e.response.status_code}"}

    # 2. Get LLM
    try:
        llm_client, model, reasoning_params, _ = get_llm_for_task("LEXICON")
    except LLMConfigError as e:
        logger.error(f"LLM not configured for explanation task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM not configured for this task: {e}")

    # 3. Construct prompt
    system_prompt = get_prompt("actions.lexicon_system")
    user_prompt_template = get_prompt("actions.lexicon_user_template")

    if not system_prompt or not user_prompt_template:
        logger.error("Lexicon system or user template prompt not found!")
        raise HTTPException(status_code=500, detail="Lexicon prompts not configured.")

    # Replace placeholders in the user prompt template
    user_prompt = user_prompt_template.replace("{term}", request.term)
    user_prompt = user_prompt.replace("{context_text}", request.context_text)
    user_prompt = user_prompt.replace("{sefaria_data}", json.dumps(sefaria_data, indent=2, ensure_ascii=False))

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    # 4. Call LLM and stream response
    async def stream_llm_response():
        logger.info("LEXICON_STREAM: Initiating LLM call.")
        try:
            stream = llm_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                **reasoning_params
            )
            logger.info("LEXICON_STREAM: Stream object created. Iterating over chunks...")
            chunk_count = 0
            for chunk in stream:
                chunk_count += 1
                content = chunk.choices[0].delta.content
                if content:
                    yield content
            logger.info(f"LEXICON_STREAM: Stream finished. Total chunks received: {chunk_count}")
        except Exception as e:
            logger.error(f"LEXICON_STREAM: Error during stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "data": {"message": "Error: Could not get explanation from LLM."}})

    logger.info("LEXICON_HANDLER: Handler finished, returning StreamingResponse object.")
    return StreamingResponse(stream_llm_response(), media_type="text/event-stream")

class SpeechifyRequest(BaseModel):
    text: Optional[str] = None
    hebrew_text: Optional[str] = None
    english_text: Optional[str] = None

@app.post("/actions/speechify")
async def speechify_handler(request: SpeechifyRequest):
    """
    Handles text-to-colloquial-speech ("Speechification") requests.
    1. Rewrites text to be more conversational using an LLM.
    2. Synthesizes audio from the rewritten text using the TTS service.
    3. Streams the audio back to the client.
    """
    language_preference = get_config_section("actions.speechify.language_preference", "english_only")
    
    text_to_speechify = ""
    if language_preference == "english_only":
        text_to_speechify = request.english_text or request.text or ""
    elif language_preference == "hebrew_only":
        text_to_speechify = request.hebrew_text or ""
    elif language_preference == "hebrew_and_english":
        text_to_speechify = f"English: {request.english_text}\n\nHebrew: {request.hebrew_text}"
    
    if not text_to_speechify:
        raise HTTPException(status_code=400, detail="No text provided for speechification.")

    logger.info(f"Received speechify request for text: {text_to_speechify[:50]}...")

    # 1. Rewrite text with LLM
    try:
        llm_client, model, reasoning_params, _ = get_llm_for_task("SPEECHIFY")
        rewrite_prompt = get_prompt("actions.speechify_system")
        if not rewrite_prompt:
            raise HTTPException(status_code=500, detail="Speechify system prompt not configured.")

        messages = [
            {"role": "system", "content": rewrite_prompt},
            {"role": "user", "content": text_to_speechify}
        ]
        
        response = await asyncio.to_thread(
            llm_client.chat.completions.create,
            model=model,
            messages=messages,
            **reasoning_params
        )
        rewritten_text = response.choices[0].message.content
        logger.info(f"Successfully rewrote text for speechification: {rewritten_text[:50]}...")

    except LLMConfigError as e:
        logger.error(f"LLM not configured for speechify task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM not configured for this task: {e}")
    except Exception as e:
        logger.error(f"Error calling LLM for text rewrite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to rewrite text with LLM.")

    # 2. Get audio stream from TTS service
    try:
        tts_client = get_tts_client()
        audio_stream = tts_client.get_audio_stream(rewritten_text)
        return StreamingResponse(audio_stream, media_type="audio/wav")
    except Exception as e:
        logger.error(f"Error getting audio stream from TTS client: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate audio stream.")


# --- Admin & Config ---
# TODO: Add authentication to this endpoint
@app.get("/admin/config")
async def get_config_handler():
    """
    Returns the current application configuration.
    """
    return get_config()

@app.patch("/admin/config")
async def update_config_handler(settings: Dict[str, Any]):
    """
    Updates the configuration and returns the new settings.
    """
    try:
        updated_config = update_config(settings)
        logger.info("AUDIT: Configuration updated", extra={"settings_changed": settings})
        return updated_config
    except Exception as e:
        logger.error(f"Failed to update configuration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# --- Admin & Prompts ---
from config.prompts import list_prompts, get_prompt, update_prompt

class PromptUpdateRequest(BaseModel):
    text: str

@app.get("/admin/prompts")
async def list_prompts_handler():
    """Lists all available prompts."""
    return list_prompts()

@app.get("/admin/prompts/{prompt_id:path}")
async def get_prompt_handler(prompt_id: str):
    """Gets a single prompt by its full ID."""
    prompt_text = get_prompt(prompt_id)
    if prompt_text is None:
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found.")
    return {"id": prompt_id, "text": prompt_text}

@app.put("/admin/prompts/{prompt_id:path}")
async def update_prompt_handler(prompt_id: str, request: PromptUpdateRequest):
    """Updates a prompt's text."""
    success = update_prompt(prompt_id, request.text)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to update prompt '{prompt_id}'.")
    logger.info(f"AUDIT: Prompt '{prompt_id}' updated.", extra={"prompt_id": prompt_id, "new_text": request.text})
    return {"status": "ok"}


# --- Admin & Personalities ---
from config import personalities as personality_service

class PersonalityPublic(BaseModel):
    id: str
    name: str
    description: str
    flow: str

class PersonalityFull(PersonalityPublic):
    system_prompt: Optional[str] = None
    use_sefaria_tools: Optional[bool] = False
    use_research_memory: Optional[bool] = False
    # Add other fields from the TOML structure as needed

@app.get("/admin/personalities", response_model=List[PersonalityPublic])
async def list_personalities_handler():
    """Lists all available personalities."""
    return personality_service.list_personalities()

@app.get("/admin/personalities/{personality_id}", response_model=PersonalityFull)
async def get_personality_handler(personality_id: str):
    """Gets the full details for a single personality."""
    personality = personality_service.get_personality(personality_id)
    if not personality:
        raise HTTPException(status_code=404, detail=f"Personality '{personality_id}' not found.")
    return personality

@app.post("/admin/personalities", response_model=PersonalityFull, status_code=status.HTTP_201_CREATED)
async def create_personality_handler(personality_data: PersonalityFull):
    """Creates a new personality."""
    created = personality_service.create_personality(personality_data.model_dump())
    if not created:
        raise HTTPException(status_code=409, detail=f"Personality with ID '{personality_data.id}' already exists or is invalid.")
    return created

@app.put("/admin/personalities/{personality_id}", response_model=PersonalityFull)
async def update_personality_handler(personality_id: str, personality_data: PersonalityFull):
    """Updates an existing personality."""
    updated = personality_service.update_personality(personality_id, personality_data.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail=f"Personality with ID '{personality_id}' not found.")
    return updated

@app.delete("/admin/personalities/{personality_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personality_handler(personality_id: str):
    """Deletes a personality."""
    success = personality_service.delete_personality(personality_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Personality with ID '{personality_id}' not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Health & Main ---
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "brain"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7030)
