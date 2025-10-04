import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

import redis.asyncio as redis

logger = logging.getLogger(__name__)

class SessionService:
    """
    Service for managing chat and study sessions.
    
    Handles session storage, retrieval, and listing functionality
    for both chat sessions and study sessions.
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis_client = redis_client
    
    async def get_all_sessions(self) -> List[Dict[str, Any]]:
        """
        Get all chat and study sessions.
        
        Returns:
            List of session dictionaries with metadata
        """
        if not self.redis_client:
            logger.warning("Redis client not available")
            return []
        
        logger.info("Fetching all chats and study sessions...")
        all_sessions = []
        
        # Get chat sessions
        try:
            async for key in self.redis_client.scan_iter("session:*"):
                session_data = await self.redis_client.get(key)
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
                    
        except Exception as e:
            logger.error("Error occurred while scanning for chat sessions", extra={
                "error": str(e)
            })
        
        # Get study sessions
        try:
            study_keys = [key async for key in self.redis_client.scan_iter("study:sess:*:top")]
            for key in study_keys:
                try:
                    session_id = key.split(':')[2]
                    # Note: This would need to integrate with StudyService to get snapshot
                    # For now, we'll create a basic entry
                    all_sessions.append({
                        "session_id": session_id,
                        "name": "Study Session",
                        "last_modified": datetime.now().isoformat(),
                        "type": "study"
                    })
                except (IndexError, AttributeError) as e:
                    logger.warning(f"Failed to process study session key {key}: {e}")
                    
        except Exception as e:
            logger.error("Error occurred while scanning for study sessions", extra={
                "error": str(e)
            })
        
        # Get daily sessions
        try:
            daily_keys = [key async for key in self.redis_client.scan_iter("daily:sess:*:top")]
            for key in daily_keys:
                try:
                    session_id = key.split(':')[2]
                    session_data = await self.redis_client.get(key)
                    if session_data:
                        try:
                            session = json.loads(session_data)
                            # Format daily session name (just title)
                            session_name = session.get('title', 'Daily Study')
                            
                            all_sessions.append({
                                "session_id": session_id,
                                "name": session_name,
                                "last_modified": session.get("last_modified", datetime.now().isoformat()),
                                "type": "daily",
                                "completed": session.get("completed", False)
                            })
                        except json.JSONDecodeError:
                            logger.warning(f"Failed to decode JSON for daily key {key}, skipping.")
                    else:
                        # Create basic entry for daily session without data
                        all_sessions.append({
                            "session_id": session_id,
                            "name": "Daily Study",
                            "last_modified": datetime.now().isoformat(),
                            "type": "daily",
                            "completed": False
                        })
                except (IndexError, AttributeError) as e:
                    logger.warning(f"Failed to process daily session key {key}: {e}")
                    
        except Exception as e:
            logger.error("Error occurred while scanning for daily sessions", extra={
                "error": str(e)
            })
        
        # Sort by last_modified, most recent first
        sorted_sessions = sorted(
            [s for s in all_sessions if s.get("last_modified")], 
            key=lambda x: x["last_modified"], 
            reverse=True
        )
        
        logger.info("Retrieved sessions", extra={
            "total_sessions": len(sorted_sessions),
            "chat_sessions": len([s for s in sorted_sessions if s["type"] == "chat"]),
            "study_sessions": len([s for s in sorted_sessions if s["type"] == "study"]),
            "daily_sessions": len([s for s in sorted_sessions if s["type"] == "daily"])
        })
        
        return sorted_sessions
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific session by ID.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session data or None if not found
        """
        if not self.redis_client:
            return None
        
        try:
            # Try chat session first
            session_data = await self.redis_client.get(f"session:{session_id}")
            if session_data:
                session = json.loads(session_data)
                logger.info("Retrieved chat session", extra={"session_id": session_id})
                return session
            
            # Try study session
            study_data = await self.redis_client.get(f"study:sess:{session_id}:top")
            if study_data:
                study_session = json.loads(study_data)
                logger.info("Retrieved study session", extra={"session_id": session_id})
                return study_session
            
            # Try daily session
            daily_data = await self.redis_client.get(f"daily:sess:{session_id}:top")
            if daily_data:
                daily_session = json.loads(daily_data)
                logger.info("Retrieved daily session", extra={"session_id": session_id})
                return daily_session
            
            logger.info("Session not found", extra={"session_id": session_id})
            return None
            
        except json.JSONDecodeError:
            logger.error("Failed to decode session JSON", extra={"session_id": session_id})
            return None
        except Exception as e:
            logger.error("Error retrieving session", extra={
                "session_id": session_id,
                "error": str(e)
            })
            return None
    
    async def save_session(self, session_id: str, session_data: Dict[str, Any], session_type: str = "chat") -> bool:
        """
        Save session data to Redis.
        
        Args:
            session_id: Session identifier
            session_data: Session data to save
            session_type: Type of session ("chat" or "study")
            
        Returns:
            True if saved successfully
        """
        if not self.redis_client:
            return False
        
        try:
            # Add timestamp
            session_data["last_modified"] = datetime.now().isoformat()
            
            if session_type == "chat":
                key = f"session:{session_id}"
            elif session_type == "study":
                key = f"study:sess:{session_id}:top"
            elif session_type == "daily":
                key = f"daily:sess:{session_id}:top"
            else:
                logger.error("Invalid session type", extra={"session_type": session_type})
                return False
            
            await self.redis_client.set(
                key, 
                json.dumps(session_data, ensure_ascii=False)
            )
            
            logger.info("Session saved", extra={
                "session_id": session_id,
                "session_type": session_type
            })
            
            return True
            
        except Exception as e:
            logger.error("Failed to save session", extra={
                "session_id": session_id,
                "session_type": session_type,
                "error": str(e)
            })
            return False
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session from Redis.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if deleted successfully
        """
        if not self.redis_client:
            return False
        
        try:
            # Try to delete both chat and study session keys
            chat_key = f"session:{session_id}"
            study_key = f"study:sess:{session_id}:top"
            
            deleted_count = 0
            if await self.redis_client.exists(chat_key):
                await self.redis_client.delete(chat_key)
                deleted_count += 1
            
            if await self.redis_client.exists(study_key):
                await self.redis_client.delete(study_key)
                deleted_count += 1
            
            if deleted_count > 0:
                logger.info("Session deleted", extra={
                    "session_id": session_id,
                    "keys_deleted": deleted_count
                })
                return True
            else:
                logger.info("Session not found for deletion", extra={"session_id": session_id})
                return False
                
        except Exception as e:
            logger.error("Failed to delete session", extra={
                "session_id": session_id,
                "error": str(e)
            })
            return False
    
    async def get_session_count(self) -> Dict[str, int]:
        """
        Get count of sessions by type.
        
        Returns:
            Dictionary with session counts
        """
        if not self.redis_client:
            return {"chat": 0, "study": 0, "total": 0}
        
        try:
            chat_count = 0
            study_count = 0
            
            # Count chat sessions
            async for _ in self.redis_client.scan_iter("session:*"):
                chat_count += 1
            
            # Count study sessions
            async for _ in self.redis_client.scan_iter("study:sess:*:top"):
                study_count += 1
            
            total_count = chat_count + study_count
            
            return {
                "chat": chat_count,
                "study": study_count,
                "total": total_count
            }
            
        except Exception as e:
            logger.error("Failed to count sessions", extra={"error": str(e)})
            return {"chat": 0, "study": 0, "total": 0}
    
    async def cleanup_old_sessions(self, max_age_days: int = 30) -> int:
        """
        Clean up old sessions based on last_modified timestamp.
        
        Args:
            max_age_days: Maximum age in days before cleanup
            
        Returns:
            Number of sessions cleaned up
        """
        if not self.redis_client:
            return 0
        
        try:
            cutoff_date = datetime.now().timestamp() - (max_age_days * 24 * 60 * 60)
            cleaned_count = 0
            
            # Check chat sessions
            async for key in self.redis_client.scan_iter("session:*"):
                try:
                    session_data = await self.redis_client.get(key)
                    if session_data:
                        session = json.loads(session_data)
                        last_modified = session.get("last_modified")
                        
                        if last_modified:
                            # Parse ISO format timestamp
                            session_time = datetime.fromisoformat(last_modified.replace('Z', '+00:00')).timestamp()
                            if session_time < cutoff_date:
                                await self.redis_client.delete(key)
                                cleaned_count += 1
                                
                except (json.JSONDecodeError, ValueError, TypeError):
                    # If we can't parse the session, it might be corrupted - delete it
                    await self.redis_client.delete(key)
                    cleaned_count += 1
            
            logger.info("Session cleanup completed", extra={
                "cleaned_count": cleaned_count,
                "max_age_days": max_age_days
            })
            
            return cleaned_count
            
        except Exception as e:
            logger.error("Failed to cleanup old sessions", extra={
                "error": str(e),
                "max_age_days": max_age_days
            })
            return 0

