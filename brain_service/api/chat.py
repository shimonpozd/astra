import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.dependencies import get_chat_service, get_session_service, get_redis_client
from core.rate_limiting import rate_limit_dependency
from services.chat_service import ChatService
from services.session_service import SessionService

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Models ---
class ChatRequest(BaseModel):
    text: str
    user_id: str
    session_id: Optional[str] = None
    agent_id: Optional[str] = None

# --- Endpoints ---
@router.post("/chat/stream")
async def chat_stream_handler(
    request: ChatRequest, 
    chat_service: ChatService = Depends(get_chat_service),
    _: bool = Depends(rate_limit_dependency(limit=5))  # Stricter limit for LLM endpoints
):
    """Stream chat response with LLM and tool integration."""
    return StreamingResponse(
        chat_service.process_chat_stream(
            text=request.text,
            user_id=request.user_id,
            session_id=request.session_id,
            agent_id=request.agent_id
        ), 
        media_type="application/x-ndjson"
    )

@router.post("/chat/stream-blocks")
async def chat_stream_blocks_handler(
    request: ChatRequest, 
    chat_service: ChatService = Depends(get_chat_service),
    _: bool = Depends(rate_limit_dependency(limit=5))  # Stricter limit for LLM endpoints
):
    """Stream chat response with block-by-block rendering."""
    return StreamingResponse(
        chat_service.process_chat_stream_with_blocks(
            text=request.text,
            user_id=request.user_id,
            session_id=request.session_id,
            agent_id=request.agent_id
        ), 
        media_type="application/x-ndjson"
    )

@router.get("/chats")
async def get_chats(chat_service: ChatService = Depends(get_chat_service)):
    """Get all chat and study sessions."""
    logger.info(f"ChatService redis_client is None: {chat_service.redis_client is None}")
    return await chat_service.get_all_chats()

@router.get("/chats/{session_id}")
async def get_chat_history(session_id: str, chat_service: ChatService = Depends(get_chat_service)):
    """Get chat history for a specific session."""
    history = await chat_service.get_chat_history(session_id)
    return {"history": history}

@router.delete("/sessions/{session_id}/{session_type}", status_code=204)
async def delete_session(
    session_id: str, 
    session_type: str, 
    chat_service: ChatService = Depends(get_chat_service)
):
    """Delete a session by ID and type."""
    success = await chat_service.delete_session(session_id, session_type)
    if not success:
        raise HTTPException(status_code=404, detail=f"{session_type.title()} session not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# --- Session Management with SessionService ---

@router.get("/sessions")
async def get_all_sessions_handler(
    session_service: SessionService = Depends(get_session_service)
):
    """Get all chat and study sessions using SessionService."""
    return await session_service.get_all_sessions()

@router.get("/sessions/{session_id}")
async def get_session_handler(
    session_id: str,
    session_service: SessionService = Depends(get_session_service)
):
    """Get a specific session by ID using SessionService."""
    session = await session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

# --- Daily Learning Sessions ---

@router.get("/daily/calendar")
async def get_daily_calendar():
    """Get today's calendar items for virtual daily chat list."""
    from datetime import datetime
    import httpx
    
    try:
        # Get today's calendar from Sefaria
        params = {
            "diaspora": "1",
            "custom": "ashkenazi",
            "year": datetime.now().year,
            "month": datetime.now().month,
            "day": datetime.now().day
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get("https://www.sefaria.org/api/calendars", params=params, timeout=30.0)
            response.raise_for_status()
            calendar_data = response.json()
        
        # Process calendar items for virtual list
        today = datetime.now().strftime("%Y-%m-%d")
        virtual_chats = []
        
        total_items = len(calendar_data.get("calendar_items", []))
        logger.info(f"📅 CALENDAR DEBUG: Processing {total_items} calendar items")
        
        for idx, item in enumerate(calendar_data.get("calendar_items", [])):
            title_en = item.get("title", {}).get("en", "")
            ref = item.get("ref")
            
            logger.info(f"📅 ITEM #{idx+1}: title='{title_en}', ref='{ref}', has_ref={bool(ref)}")
            
            if not ref:
                logger.warning(f"📅 SKIPPING ITEM #{idx+1}: '{title_en}' - no ref")
                continue
                
            # Create slug from title
            slug = title_en.lower().replace(" ", "-").replace("(", "").replace(")", "")
            session_id = f"daily-{today}-{slug}"
            
            logger.info(f"📅 ADDING ITEM #{idx+1}: '{title_en}' -> session_id='{session_id}'")
            
            virtual_chats.append({
                "session_id": session_id,
                "title": title_en,
                "he_title": item.get("title", {}).get("he", ""),
                "display_value": item.get("displayValue", {}).get("en", ""),
                "he_display_value": item.get("displayValue", {}).get("he", ""),
                "ref": ref,
                "category": item.get("category", ""),
                "order": item.get("order", 0),
                "date": today,
                "exists": False  # Will be checked on demand
            })
        
        # Sort by order
        virtual_chats.sort(key=lambda x: x["order"])
        
        return {
            "date": today,
            "virtual_chats": virtual_chats,
            "total": len(virtual_chats)
        }
        
    except Exception as e:
        logger.error(f"Failed to get daily calendar: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get calendar: {str(e)}")

@router.post("/daily/create/{session_id}")
async def create_daily_session_lazy(
    session_id: str,
    session_service: SessionService = Depends(get_session_service)
):
    """Lazy create daily session when first accessed."""
    from datetime import datetime
    import httpx
    import re
    
    # Check if already exists
    existing_session = await session_service.get_session(session_id)
    if existing_session:
        return {"session_id": session_id, "message": "Daily session already exists", "created": False}
    
    # Parse session_id: daily-2025-10-02-daf-yomi
    match = re.match(r'daily-(\d{4}-\d{2}-\d{2})-(.+)', session_id)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid daily session ID format")
    
    date_str, slug = match.groups()
    
    try:
        # Get calendar for that date
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        params = {
            "diaspora": "1",
            "custom": "ashkenazi",
            "year": date_obj.year,
            "month": date_obj.month,
            "day": date_obj.day
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get("https://www.sefaria.org/api/calendars", params=params, timeout=30.0)
            response.raise_for_status()
            calendar_data = response.json()
        
        # Find matching calendar item
        target_item = None
        for item in calendar_data.get("calendar_items", []):
            title_en = item.get("title", {}).get("en", "")
            item_slug = title_en.lower().replace(" ", "-").replace("(", "").replace(")", "")
            if item_slug == slug:
                target_item = item
                break
        
        if not target_item:
            raise HTTPException(status_code=404, detail="Calendar item not found")
        
        # Create session data
        session_data = {
            "ref": target_item.get("ref"),
            "date": date_str,
            "title": target_item.get("title", {}).get("en", ""),
            "he_title": target_item.get("title", {}).get("he", ""),
            "display_value": target_item.get("displayValue", {}).get("en", ""),
            "category": target_item.get("category", ""),
            "order": target_item.get("order", 0),
            "completed": False,
            "created_at": datetime.now().isoformat(),
            "session_type": "daily"
        }
        
        # Save session
        success = await session_service.save_session(session_id, session_data, "daily")
        
        if success:
            return {
                "session_id": session_id,
                "ref": target_item.get("ref"),
                "title": target_item.get("title", {}).get("en", ""),
                "message": "Daily session created successfully",
                "created": True
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create daily session")
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid date format")
    except Exception as e:
        logger.error(f"Failed to create daily session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create daily session: {str(e)}")

@router.patch("/daily/{session_id}/complete")
async def mark_daily_complete(
    session_id: str,
    completed: bool,
    session_service: SessionService = Depends(get_session_service)
):
    """Mark daily session as completed or uncompleted."""
    
    # Get existing session
    session = await session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Daily session not found")
    
    # Update completed status
    session["completed"] = completed
    
    # Save updated session
    success = await session_service.save_session(session_id, session, "daily")
    
    if success:
        return {"session_id": session_id, "completed": completed, "message": "Status updated"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update session")

@router.get("/daily/{session_id}/segments")
async def get_daily_segments(
    session_id: str,
    session_service: SessionService = Depends(get_session_service),
    redis_client = Depends(get_redis_client)
):
    """Get all loaded segments for a daily session."""
    
    try:
        # Get segments from Redis
        segments_key = f"daily:sess:{session_id}:segments"
        total_key = f"daily:sess:{session_id}:total_segments"
        
        # Get all segments
        segments_data = await redis_client.lrange(segments_key, 0, -1)
        total_segments = await redis_client.get(total_key)
        
        # Parse segments
        segments = []
        for segment_json in segments_data:
            import json
            segment = json.loads(segment_json)
            segments.append({
                "ref": segment.get("ref"),
                "text": segment.get("en_text", ""),
                "heText": segment.get("he_text", ""),
                "position": len(segments) / max(1, int(total_segments or 1) - 1),
                "metadata": {
                    "title": segment.get("title"),
                    "indexTitle": segment.get("indexTitle"),
                    "heRef": segment.get("heRef")
                }
            })
        
        return {
            "session_id": session_id,
            "segments": segments,
            "total_segments": int(total_segments or 0),
            "loaded_segments": len(segments)
        }
        
    except Exception as e:
        logger.error(f"Failed to get daily segments for {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get segments: {str(e)}")
