# brain/study_state.py
import json
import logging_utils
import datetime
import asyncio
from brain.state import state

logger = logging_utils.get_logger(__name__)

# --- Constants ---
SESSION_TTL_DAYS = 30

# --- Redis Key Schemas ---
def _history_key(session_id: str) -> str:
    return f"study:sess:{session_id}:history"

def _cursor_key(session_id: str) -> str:
    return f"study:sess:{session_id}:cursor"

def _top_key(session_id: str) -> str:
    return f"study:sess:{session_id}:top"

from typing import Dict, Any, Optional, List, Union

from pydantic import BaseModel, Field, root_validator

# --- Data Models ---

# Legacy models (for validation of old data)
class LegacyFocus(BaseModel):
    ref: str
    title: str
    text_full: str
    he_text_full: Optional[str] = None
    collection: str

class LegacyWindowItem(BaseModel):
    ref: str
    preview: str

class LegacyWindow(BaseModel):
    prev: List[LegacyWindowItem]
    next: List[LegacyWindowItem]

# New, unified data models
class TextSegmentMetadata(BaseModel):
    verse: Optional[int] = None
    chapter: Optional[int] = None
    page: Optional[str] = None
    line: Optional[int] = None
    title: Optional[str] = None
    indexTitle: Optional[str] = None

class TextSegment(BaseModel):
    ref: str
    text: str
    heText: str
    position: float
    metadata: TextSegmentMetadata

class BookshelfItem(BaseModel):
    ref: str
    heRef: Optional[str] = None
    commentator: str
    indexTitle: str
    category: Optional[str] = None
    heCategory: Optional[str] = None
    commentaryNum: Optional[Any] = None
    score: Optional[float] = None
    preview: str
    text_full: Optional[str] = None
    heTextFull: Optional[str] = None
    title: Optional[str] = None
    heTitle: Optional[str] = None

class Bookshelf(BaseModel):
    counts: Dict[str, int]
    items: List[BookshelfItem]

class ChatMessage(BaseModel):
    role: str
    content: Union[str, Dict[str, Any]]
    content_type: str = "text.v1"

class StudySnapshot(BaseModel):
    # New fields (target state)
    segments: Optional[List[TextSegment]] = None
    focusIndex: Optional[int] = None
    ref: Optional[str] = None

    # Legacy fields (for backward compatibility)
    focus: Optional[LegacyFocus] = None
    window: Optional[LegacyWindow] = None

    # Other state properties
    bookshelf: Bookshelf
    chat_local: List[ChatMessage] = Field(default_factory=list)
    ts: int
    workbench: Dict[str, Optional[BookshelfItem]] = Field(default_factory=lambda: {"left": None, "right": None})
    discussion_focus_ref: Optional[str] = None

# --- Core State Functions ---

async def get_current_snapshot(session_id: str) -> Optional[StudySnapshot]:
    """Retrieves the current snapshot from the cache (:top key)."""
    if not state.redis_client:
        logger.warning("Redis client not available.")
        return None
    
    top_key = _top_key(session_id)
    logger.info(f"STUDY_STATE: Attempting to retrieve snapshot for key: {top_key}")
    snapshot_json = await state.redis_client.get(top_key)
    
    if snapshot_json:
        logger.info(f"STUDY_STATE: Snapshot found for key: {top_key}")
        return StudySnapshot(**json.loads(snapshot_json))
    logger.warning(f"STUDY_STATE: No snapshot found for key: {top_key}")
    return None

async def push_new_snapshot(session_id: str, snapshot: StudySnapshot) -> bool:
    """Pushes a new snapshot, trimming forward history, and updates top/cursor."""
    if not state.redis_client:
        return False

    history_key = _history_key(session_id)
    cursor_key = _cursor_key(session_id)
    top_key = _top_key(session_id)

    try:
        # Get current cursor
        cursor_str = await state.redis_client.get(cursor_key)
        cursor = int(cursor_str) if cursor_str is not None else -1

        # Trim forward history if we are not at the end of the list
        if cursor > -1:
            await state.redis_client.ltrim(history_key, 0, cursor)

        # The timestamp is now added at creation time in the endpoint.
        snapshot_json = json.dumps(snapshot.model_dump())
        await state.redis_client.rpush(history_key, snapshot_json)

        # Update cursor to point to the new last element
        new_cursor = await state.redis_client.llen(history_key) - 1
        
        # Use a pipeline for atomic updates of cursor, top, and TTLs
        async with state.redis_client.pipeline() as pipe:
            pipe.set(cursor_key, new_cursor)
            pipe.set(top_key, snapshot_json)
            
            # Set TTLs for all keys
            ttl_seconds = SESSION_TTL_DAYS * 24 * 60 * 60
            pipe.expire(history_key, ttl_seconds)
            pipe.expire(cursor_key, ttl_seconds)
            pipe.expire(top_key, ttl_seconds)
            
            await pipe.execute()

        logger.info(f"Pushed new snapshot for session '{session_id}' at index {new_cursor}.")
        return True

    except Exception as e:
        logger.error(f"Failed to push snapshot for session '{session_id}': {e}", exc_info=True)
        return False

async def move_cursor(session_id: str, direction: int) -> Optional[StudySnapshot]:
    """Moves the cursor back (-1) or forward (+1) and returns the new top snapshot."""
    if not state.redis_client or direction not in [-1, 1]:
        return None

    history_key = _history_key(session_id)
    cursor_key = _cursor_key(session_id)
    top_key = _top_key(session_id)

    try:
        # Get current cursor and history length
        cursor, history_len = await asyncio.gather(
            state.redis_client.get(cursor_key),
            state.redis_client.llen(history_key)
        )
        cursor = int(cursor) if cursor is not None else -1

        # Calculate new cursor position
        new_cursor = cursor + direction

        # Check boundaries
        if not (0 <= new_cursor < history_len):
            logger.warning(f"Cannot move cursor for session '{session_id}'. Current: {cursor}, Attempted: {new_cursor}, History: {history_len}")
            return None # Or raise an exception

        # Get the new snapshot from history
        new_snapshot_json = await state.redis_client.lindex(history_key, new_cursor)
        if not new_snapshot_json:
            logger.error(f"Mismatch between history length and lindex for session '{session_id}'.")
            return None

        # Update cursor and top cache
        async with state.redis_client.pipeline() as pipe:
            pipe.set(cursor_key, new_cursor)
            pipe.set(top_key, new_snapshot_json)
            await pipe.execute()
        
        logger.info(f"Moved cursor for session '{session_id}' to index {new_cursor}.")
        return StudySnapshot(**json.loads(new_snapshot_json))

    except Exception as e:
        logger.error(f"Failed to move cursor for session '{session_id}': {e}", exc_info=True)
        return None

async def restore_by_index(session_id: str, index: int) -> Optional[StudySnapshot]:
    """Sets the cursor to a specific index without trimming history."""
    if not state.redis_client:
        return None

    history_key = _history_key(session_id)
    cursor_key = _cursor_key(session_id)
    top_key = _top_key(session_id)

    try:
        history_len = await state.redis_client.llen(history_key)
        if not (0 <= index < history_len):
            logger.warning(f"Invalid index for restore: {index}. History length: {history_len}")
            return None

        snapshot_json = await state.redis_client.lindex(history_key, index)
        if not snapshot_json:
            return None

        # Update cursor and top cache
        await state.redis_client.set(cursor_key, index)
        await state.redis_client.set(top_key, snapshot_json)

        logger.info(f"Restored session '{session_id}' to index {index}.")
        return StudySnapshot(**json.loads(snapshot_json))

    except Exception as e:
        logger.error(f"Failed to restore by index for session '{session_id}': {e}", exc_info=True)
        return None

async def update_local_chat(session_id: str, new_messages: List[Dict[str, str]]) -> bool:
    """Appends messages to the local_chat of the current snapshot."""
    if not state.redis_client:
        return False

    top_key = _top_key(session_id)
    history_key = _history_key(session_id)
    cursor_key = _cursor_key(session_id)

    try:
        # Get current snapshot and cursor
        snapshot_json, cursor_str = await asyncio.gather(
            state.redis_client.get(top_key),
            state.redis_client.get(cursor_key)
        )

        if not snapshot_json or cursor_str is None:
            logger.warning(f"Cannot update chat for session '{session_id}', no active snapshot.")
            return False

        snapshot = StudySnapshot(**json.loads(snapshot_json))
        cursor = int(cursor_str)

        logger.info(f"UPDATING CHAT for {session_id}. Before: {len(snapshot.chat_local or [])} messages.")

        # Append messages
        if snapshot.chat_local is None:
            snapshot.chat_local = []
        for msg in new_messages:
            snapshot.chat_local.append(ChatMessage(**msg))

        logger.info(f"UPDATING CHAT for {session_id}. After: {len(snapshot.chat_local)} messages.")

        # Update the snapshot in both :top and :history
        updated_snapshot_json = json.dumps(snapshot.model_dump())

        async with state.redis_client.pipeline() as pipe:
            pipe.set(top_key, updated_snapshot_json)
            pipe.lset(history_key, cursor, updated_snapshot_json)
            await pipe.execute()
        return True

    except Exception as e:
        logger.error(f"Failed to update local chat for session '{session_id}': {e}", exc_info=True)
        return False

async def replace_top_snapshot(session_id: str, snapshot: StudySnapshot) -> bool:
    """Replaces the most recent snapshot in history with a new one."""
    if not state.redis_client:
        return False

    history_key = _history_key(session_id)
    cursor_key = _cursor_key(session_id)
    top_key = _top_key(session_id)

    try:
        cursor_str = await state.redis_client.get(cursor_key)
        if cursor_str is None:
            # If there's no history, we can treat this as a push
            return await push_new_snapshot(session_id, snapshot)
        
        cursor = int(cursor_str)
        snapshot.ts = int(datetime.datetime.now().timestamp())
        snapshot_json = json.dumps(snapshot.model_dump())

        async with state.redis_client.pipeline() as pipe:
            pipe.lset(history_key, cursor, snapshot_json) # Replace the item at the current cursor
            pipe.set(top_key, snapshot_json)
            await pipe.execute()

        logger.info(f"Replaced snapshot for session '{session_id}' at index {cursor}.")
        return True

    except Exception as e:
        logger.error(f"Failed to replace snapshot for session '{session_id}': {e}", exc_info=True)
        return False
