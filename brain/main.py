import logging_utils
import logging
import os
import json
import time
import asyncio
import uuid
import re
import html
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, AsyncGenerator, Tuple

import httpx
import uvicorn
import redis.asyncio as redis
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, HTTPException, Response, status, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionChunk

from .llm_config import get_llm_for_task, LLMConfigError, reload_llm_config
from .sefaria_client import sefaria_get_text_v3_async, sefaria_get_related_links_async
from .sefaria_index import load_toc, resolve_book_name, get_bookshelf_categories
from .study_utils import get_text_with_window, get_bookshelf_for
from .settings import (
    REDIS_URL,
    MEMORY_SERVICE_URL,
    ITERATION_MAX,
)
from .study_state import (
    push_new_snapshot, get_current_snapshot, move_cursor, restore_by_index, 
    update_local_chat, StudySnapshot, replace_top_snapshot, Bookshelf, BookshelfItem, ChatMessage
)
from .state import state
from .doc_v1_models import DocV1, ParagraphBlock
from config import get_config, update_config, CONFIG_CHANNEL, get_config_section
from config.prompts import get_prompt, list_prompts, update_prompt
from config import personalities as personality_service

logger = logging_utils.get_logger("brain-service", service="brain")

class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/health") == -1

logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
app = FastAPI(title="Brain Service", version="23.0.0")

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"type": "error", "data": {"message": "An internal server error occurred."}})

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

async def config_update_listener():
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
    except redis.ConnectionError as e:
        logger.error(f"Redis connection lost in config listener: {e}. Hot-reload will not work.")
    except Exception as e:
        logger.error(f"Error in config update listener: {e}", exc_info=True)

@app.on_event("startup")
async def startup_event():
    try:
        state.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await state.redis_client.ping()
        asyncio.create_task(config_update_listener())
    except redis.ConnectionError as e:
        logger.error(f"Redis connection failed: {e}")
        state.redis_client = None
    await load_toc()

# --- CHAT & SESSION LISTING ---
@app.get("/chats")
async def get_chats():
    if not state.redis_client:
        logger.warning("Redis client not available")
        return []

    logger.info("Fetching all chats and study sessions...")
    all_sessions = []
    
    try:
        async for key in state.redis_client.scan_iter("session:*"):
            session_data = await state.redis_client.get(key)
            if not session_data: continue
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
    except Exception as e:
        logger.error(f"An error occurred while scanning for chat sessions: {e}", exc_info=True)

    try:
        study_keys = [key async for key in state.redis_client.scan_iter("study:sess:*:top")]
        for key in study_keys:
            try:
                session_id = key.split(':')[2]
                snapshot = await get_current_snapshot(session_id)
                if snapshot:
                    all_sessions.append({
                        "session_id": session_id,
                        "name": snapshot.ref or "Study Session",
                        "last_modified": datetime.fromtimestamp(snapshot.ts).isoformat(),
                        "type": "study"
                    })
            except (IndexError, AttributeError) as e:
                logger.warning(f"Failed to process study session key {key}: {e}")
    except Exception as e:
        logger.error(f"An error occurred while scanning for study sessions: {e}", exc_info=True)

    sorted_sessions = sorted([s for s in all_sessions if s.get("last_modified")], key=lambda x: x["last_modified"], reverse=True)
    return sorted_sessions

@app.get("/chats/{session_id}")
async def get_chat_history(session_id: str):
    return {"history": []}

@app.delete("/sessions/{session_id}/{session_type}", status_code=204)
async def delete_session(session_id: str, session_type: str):
    if session_type == "chat":
        success = personality_service.delete_session(session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Chat session not found.")
    elif session_type == "study":
        if not state.redis_client:
            raise HTTPException(status_code=503, detail="Redis client not available for study sessions.")
        keys_to_delete = [f"study:sess:{session_id}:history", f"study:sess:{session_id}:cursor", f"study:sess:{session_id}:top"]
        deleted_count = await state.redis_client.delete(*keys_to_delete)
        if deleted_count == 0:
            logger.warning(f"No study session keys found for deletion with ID: {session_id}")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown session type: {session_type}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- STUDY DESK MODELS ---
class StudyBookshelfRequest(BaseModel):
    session_id: str
    ref: str
    categories: List[str]

class StudyResolveRequest(BaseModel):
    text: str

class StudySetFocusRequest(BaseModel):
    session_id: str
    ref: str
    window_size: Optional[int] = 5
    navigation_type: str = "drill_down"

class StudyStateResponse(BaseModel):
    ok: bool
    state: Optional[StudySnapshot] = None

class StudyNavigateRequest(BaseModel):
    session_id: str

class StudyWorkbenchSetRequest(BaseModel):
    session_id: str
    slot: str
    ref: Optional[str] = None

class StudyChatSetFocusRequest(BaseModel):
    session_id: str
    ref: str

class StudyChatRequest(BaseModel):
    session_id: str
    text: str

# --- STUDY DESK ENDPOINTS ---
@app.get("/study/state", response_model=StudyStateResponse)
async def study_get_state_handler(session_id: str):
    snapshot = await get_current_snapshot(session_id)
    if not snapshot:
        logger.warning(f"Study session state not found for session_id: {session_id}")
        raise HTTPException(status_code=404, detail=f"Study session not found: {session_id}")
    return {"ok": True, "state": snapshot}

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
                await replace_top_snapshot(request.session_id, snapshot)
            except Exception as exc:
                logger.error(f"Failed to attach bookshelf to snapshot {request.session_id}: {exc}")
    return bookshelf_data

@app.post("/study/resolve")
async def study_resolve_handler(request: StudyResolveRequest):
    return {"ok": False, "candidates": []}

@app.post("/study/set_focus", response_model=StudyStateResponse)
async def study_set_focus_handler(request: StudySetFocusRequest):
    try:
        window_data = await get_text_with_window(request.ref, request.window_size)
        if not window_data:
            raise HTTPException(status_code=404, detail=f"Reference not found: {request.ref}")
        bookshelf_data = await get_bookshelf_for(request.ref)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {e}")

    snapshot = StudySnapshot(
        segments=window_data['segments'],
        focusIndex=window_data['focusIndex'],
        ref=window_data['ref'],
        bookshelf=Bookshelf(**bookshelf_data),
        chat_local=[],
        ts=int(datetime.now().timestamp()),
        discussion_focus_ref=window_data['ref']
    )

    if request.navigation_type == 'advance':
        success = await replace_top_snapshot(request.session_id, snapshot)
    else:
        success = await push_new_snapshot(request.session_id, snapshot)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to save state to Redis.")

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

@app.post("/study/workbench/set", response_model=StudyStateResponse)
async def study_workbench_set_handler(request: StudyWorkbenchSetRequest):
    if request.slot not in ["left", "right"]:
        raise HTTPException(status_code=400, detail="Invalid slot specified.")

    snapshot = await get_current_snapshot(request.session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No active study session found.")

    item_to_add = None
    if request.ref:
        if not snapshot.bookshelf or not snapshot.bookshelf.items:
            raise HTTPException(status_code=404, detail="Bookshelf is empty.")
        found = False
        for item in snapshot.bookshelf.items:
            if item.ref == request.ref:
                item_to_add = item
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Item not found in current bookshelf.")
    
    if item_to_add:
        logger.info(f"Adding item to workbench: {item_to_add.model_dump_json(indent=2)}")
    else:
        logger.info("Clearing workbench slot.")

    if snapshot.workbench is None: snapshot.workbench = {}
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

    snapshot.discussion_focus_ref = request.ref
    try:
        new_bookshelf = await get_bookshelf_for(request.ref)
        snapshot.bookshelf = Bookshelf(**new_bookshelf)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update bookshelf.")

    success = await replace_top_snapshot(request.session_id, snapshot)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save state.")

    return {"ok": True, "state": snapshot}

async def study_chat_stream_processor(request: StudyChatRequest, background_tasks: BackgroundTasks):
    snapshot = await get_current_snapshot(request.session_id)
    if not snapshot:
        logger.error(f"No active study session found for ID: {request.session_id}")
        yield json.dumps({"type": "error", "data": {"message": "No active study session found."}})
        return

    discussion_ref = snapshot.discussion_focus_ref or snapshot.ref
    if not discussion_ref:
        logger.error(f"No discussion focus set for study session: {request.session_id}")
        yield json.dumps({"type": "error", "data": {"message": "No discussion focus has been set."}})
        return

    logger.info(f"Study chat for ref: {discussion_ref}")

    text_data_res = await sefaria_get_text_v3_async(discussion_ref)
    hebrew_context = text_data_res.get("data", {}).get("he_text", "")
    english_context = text_data_res.get("data", {}).get("en_text", "")

    agent_id = "chevruta_talmud"
    personality_config = personality_service.get_personality(agent_id) or {}
    system_prompt = personality_config.get("system_prompt", "")

    system_prompt = system_prompt.replace("{discussion_ref}", discussion_ref)
    context_for_prompt = f"Hebrew Text:\n```\n{hebrew_context}\n```\n\nEnglish Translation:\n```\n{english_context}\n```"
    system_prompt = system_prompt.replace("{truncated_context}", context_for_prompt)

    messages = [
        {"role": "system", "content": system_prompt},
        *[msg.model_dump() for msg in snapshot.chat_local],
        {"role": "user", "content": request.text}
    ]
    logger.info(f"Messages sent to LLM: {json.dumps(messages, indent=2)}")

    try:
        client, model, reasoning_params, _ = get_llm_for_task("CHAT")
    except LLMConfigError as e:
        yield json.dumps({"type": "error", "data": {"message": f"LLM not configured: {e}"}})
        return

    completion_args = {"model": model, "messages": messages, "stream": True}
    completion_args.update(reasoning_params)
    stream = await client.chat.completions.create(**completion_args)
    
    full_response = ""
    chunk_count = 0
    async for chunk in stream:
        chunk_count += 1
        logger.info(f"Received chunk {chunk_count}: {chunk.model_dump_json()}")
        content = chunk.choices[0].delta.content
        if content:
            full_response += content
            yield json.dumps({"type": "llm_chunk", "data": content}) + '\n'

    logger.info(f"Stream finished. Total chunks: {chunk_count}. Full response length: {len(full_response)}")

    if full_response:
        new_messages = [
            ChatMessage(role="user", content=request.text),
            ChatMessage(role="assistant", content=full_response)
        ]
        await update_local_chat(request.session_id, [msg.model_dump() for msg in new_messages])

@app.post("/study/chat")
async def study_chat_handler(request: StudyChatRequest, background_tasks: BackgroundTasks):
    return StreamingResponse(study_chat_stream_processor(request, background_tasks), media_type="application/x-ndjson")

# --- ACTIONS ---
class TranslateRequest(BaseModel):
    hebrew_text: str
    english_text: Optional[str] = None

@app.post("/actions/translate")
async def translate_handler(request: TranslateRequest):
    if not request.hebrew_text and not request.english_text:
        async def empty_stream():
            yield json.dumps({"type": "error", "data": {"message": "No text provided for translation."}})
        return StreamingResponse(empty_stream(), media_type="application/x-ndjson")
    system_prompt = get_prompt('actions.translator_system')
    user_prompt_template = get_prompt('actions.translator_user_template')

    if not system_prompt or not user_prompt_template:
        raise HTTPException(status_code=500, detail="Translation prompts not found.")

    user_prompt = user_prompt_template.format(
        hebrew_text=request.hebrew_text,
        english_text=request.english_text or "(Not provided)"
    )
    logger.info(f"Sending translation request to LLM with prompt:\n{user_prompt}")

    try:
        client, model, reasoning_params, capabilities = get_llm_for_task('TRANSLATOR')
    except LLMConfigError:
        try:
            logger.warning("LLM config for 'TRANSLATOR' task not found or invalid. Falling back to 'CHAT' task.")
            client, model, reasoning_params, capabilities = get_llm_for_task('CHAT')
        except LLMConfigError as e:
            raise HTTPException(status_code=500, detail=f"LLM configuration failed for both 'TRANSLATOR' and 'CHAT' tasks: {e}")

    async def translation_stream():
        try:
            completion_args = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
            }
            completion_args.update(reasoning_params)

            if "json_mode" in capabilities:
                completion_args["response_format"] = {"type": "json_object"}

            response = await client.chat.completions.create(**completion_args)
            
            llm_response_text = response.choices[0].message.content
            if not llm_response_text:
                raise ValueError("LLM returned an empty response.")

            try:
                translation_data = json.loads(llm_response_text)
                if not isinstance(translation_data, dict):
                    raise ValueError("LLM response is not a JSON object.")
                translation_text = translation_data.get("translation")
                if not translation_text:
                    raise ValueError("'translation' key not found or empty in LLM response.")
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"LLM did not return valid JSON: {e}. Response was: {llm_response_text}. Attempting to clean up.")
                cleaned_text = llm_response_text
                cleaned_text = re.sub(r'<think>.*?</think>\s*', '', cleaned_text, flags=re.DOTALL)
                cleaned_text = re.sub(r'{\s*"translation"\s*:\s*"(.*)"\s*}', r'\1', cleaned_text, flags=re.DOTALL)
                cleaned_text = cleaned_text.replace('```json', '').replace('```', '')
                translation_text = cleaned_text.strip()

            yield json.dumps({"type": "llm_chunk", "data": translation_text})

        except Exception as e:
            logger.error(f"Error during translation LLM call: {e}", exc_info=True)
            error_event = {"type": "error", "data": {"message": str(e)}}
            yield json.dumps(error_event)

    return StreamingResponse(translation_stream(), media_type="application/x-ndjson")

class ExplainTermRequest(BaseModel):
    term: str
    context_text: str

@app.post("/actions/explain-term")
async def explain_term_handler(request: ExplainTermRequest):
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
            stream = await llm_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                **reasoning_params
            )
            logger.info("LEXICON_STREAM: Stream object created. Iterating over chunks...")
            chunk_count = 0
            async for chunk in stream:
                chunk_count += 1
                content = chunk.choices[0].delta.content
                if content:
                    yield content
            logger.info(f"LEXICON_STREAM: Stream finished. Total chunks received: {chunk_count}")
        except Exception as e:
            logger.error(f"LEXICON_STREAM: Error during stream: {e}", exc_info=True)
            yield json.dumps({"type": "error", "data": {"message": "Error: Could not get explanation from LLM."}})

    return StreamingResponse(stream_llm_response(), media_type="text/event-stream")

# --- ADMIN ENDPOINTS ---
@app.get("/admin/config")
async def get_config_handler():
    return get_config()

@app.patch("/admin/config")
async def update_config_handler(settings: Dict[str, Any]):
    try:
        updated_config = update_config(settings)
        logger.info("AUDIT: Configuration updated", extra={"settings_changed": settings})
        return updated_config
    except Exception as e:
        logger.error(f"Failed to update configuration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class PromptUpdateRequest(BaseModel):
    text: str

@app.get("/admin/prompts")
async def list_prompts_handler():
    return list_prompts()

@app.get("/admin/prompts/{prompt_id:path}")
async def get_prompt_handler(prompt_id: str):
    prompt_text = get_prompt(prompt_id)
    if prompt_text is None:
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found.")
    return {"id": prompt_id, "text": prompt_text}

@app.put("/admin/prompts/{prompt_id:path}")
async def update_prompt_handler(prompt_id: str, request: PromptUpdateRequest):
    success = update_prompt(prompt_id, request.text)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to update prompt '{prompt_id}'.")
    logger.info(f"AUDIT: Prompt '{prompt_id}' updated.", extra={"prompt_id": prompt_id, "new_text": request.text})
    return {"status": "ok"}

class PersonalityPublic(BaseModel):
    id: str
    name: str
    description: str
    flow: str

class PersonalityFull(PersonalityPublic):
    system_prompt: Optional[str] = None
    use_sefaria_tools: Optional[bool] = False
    use_research_memory: Optional[bool] = False

@app.get("/admin/personalities", response_model=List[PersonalityPublic])
async def list_personalities_handler():
    return personality_service.list_personalities()

@app.get("/admin/personalities/{personality_id}", response_model=PersonalityFull)
async def get_personality_handler(personality_id: str):
    personality = personality_service.get_personality(personality_id)
    if not personality:
        raise HTTPException(status_code=404, detail=f"Personality '{personality_id}' not found.")
    return personality

@app.post("/admin/personalities", response_model=PersonalityFull, status_code=status.HTTP_201_CREATED)
async def create_personality_handler(personality_data: PersonalityFull):
    created = personality_service.create_personality(personality_data.model_dump())
    if not created:
        raise HTTPException(status_code=409, detail=f"Personality with ID '{personality_data.id}' already exists or is invalid.")
    return created

@app.put("/admin/personalities/{personality_id}", response_model=PersonalityFull)
async def update_personality_handler(personality_id: str, personality_data: PersonalityFull):
    updated = personality_service.update_personality(personality_id, personality_data.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail=f"Personality with ID '{personality_id}' not found.")
    return updated

@app.delete("/admin/personalities/{personality_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personality_handler(personality_id: str):
    success = personality_service.delete_personality(personality_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Personality with ID '{personality_id}' not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- HEALTH & MAIN ---
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "brain"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7030)
