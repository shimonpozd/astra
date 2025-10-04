import logging
import json
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, AsyncGenerator
from collections import defaultdict

import redis.asyncio as redis
from models.chat_models import Session
from domain.chat.tools import ToolRegistry
from core.dependencies import get_memory_service
from .block_stream_service import BlockStreamService
from core.llm_config import get_llm_for_task, LLMConfigError
from config import personalities as personality_service

logger = logging.getLogger(__name__)

class ChatService:
    """
    Service for handling chat functionality including session management,
    LLM streaming, and tool integration.
    """
    
    def __init__(self, redis_client: redis.Redis, tool_registry: ToolRegistry, memory_service):
        self.redis_client = redis_client
        self.tool_registry = tool_registry
        self.memory_service = memory_service
        self.block_stream_service = BlockStreamService()
    
    async def get_session_from_redis(self, session_id: str, user_id: str, agent_id: str) -> Session:
        """Retrieve session from Redis or create new one."""
        if self.redis_client:
            redis_key = f"session:{session_id}"
            session_data = await self.redis_client.get(redis_key)
            if session_data:
                try:
                    session = Session.from_dict(json.loads(session_data))
                    if agent_id and session.agent_id != agent_id:
                        session.agent_id = agent_id
                    return session
                except (json.JSONDecodeError, TypeError) as e:
                    logger.error(f"Failed to decode session {session_id}: {e}")
        return Session(user_id=user_id, agent_id=agent_id, persistent_session_id=session_id)
    
    async def save_session_to_redis(self, session: Session):
        """Save session to Redis."""
        if not self.redis_client:
            return
        redis_key = f"session:{session.persistent_session_id}"
        session.last_modified = datetime.now().isoformat()
        await self.redis_client.set(redis_key, json.dumps(session.to_dict()), ex=3600 * 24 * 7)
    
    async def get_llm_response_stream(
        self, 
        messages: List[Dict[str, Any]], 
        session_id: str
    ) -> AsyncGenerator[str, None]:
        """
        Generate LLM response stream with tool support and STM integration.
        
        Args:
            messages: List of message dictionaries
            session_id: Session ID for STM integration
            
        Yields:
            JSON strings with streaming events
        """
        try:
            client, model, reasoning_params, caps = get_llm_for_task("CHAT")
        except LLMConfigError as e:
            yield json.dumps({"type": "error", "data": {"message": f"LLM not configured: {e}"}}) + '\n'
            return

        # Integrate STM if available
        if self.memory_service:
            stm_data = await self.memory_service.get_stm(session_id)
            if stm_data:
                # Use the new format_stm_for_prompt method
                stm_context = self.memory_service.format_stm_for_prompt(stm_data)
                if stm_context:
                    stm_message = {
                        "role": "system", 
                        "content": f"[STM Context]\n{stm_context}"
                    }
                    messages.insert(0, stm_message)

        tools = self.tool_registry.get_tool_schemas()
        api_params = {**reasoning_params, "model": model, "messages": messages, "stream": True}
        if tools:
            api_params.update({"tools": tools, "tool_choice": "auto"})

        iter_count = 0
        while iter_count < 5:  # Max tool-use iterations
            iter_count += 1
            
            # Fix: Limit message history to prevent prompt bloat
            if len(messages) > 20:  # Keep last 20 messages
                # Keep system message and recent messages
                system_msg = messages[0] if messages and messages[0].get("role") == "system" else None
                recent_messages = messages[-19:]  # Last 19 messages
                messages = ([system_msg] + recent_messages) if system_msg else recent_messages
            
            stream = await client.chat.completions.create(**api_params)
            
            tool_call_builders = defaultdict(lambda: {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
            full_reply_content = ""
            chunk_count = 0  # Fix: Initialize chunk counter
            
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    chunk_count += 1  # Fix: Increment chunk counter
                    full_reply_content += delta.content
                    yield json.dumps({"type": "llm_chunk", "data": delta.content}) + '\n'
                if delta and delta.tool_calls:
                    for tc in delta.tool_calls:
                        builder = tool_call_builders[tc.index]
                        builder["index"] = tc.index  # Fix: Store index for stable sorting
                        if tc.id: 
                            builder["id"] = tc.id
                        if tc.function:
                            if tc.function.name: 
                                builder["function"]["name"] = tc.function.name
                            if tc.function.arguments: 
                                builder["function"]["arguments"] += tc.function.arguments

            if not tool_call_builders:
                # If we already sent chunks, don't send doc_v1 - let the accumulated text be the final result
                if chunk_count > 0:
                    # We already streamed the content as chunks, no need to send doc_v1
                    return
                
                # Check if the response is a JSON document (doc.v1 format)
                try:
                    # Fix: Use safe JSON prefix parsing
                    parsed_content, _ = self._find_valid_json_prefix(full_reply_content)
                    if parsed_content is None:
                        # No valid JSON found, send as text
                        logger.debug(f"No valid JSON found in response, sending as text. Length: {len(full_reply_content)}")
                        yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                        return
                    if isinstance(parsed_content, dict):
                        # Check for direct doc.v1 format with blocks
                        if ((parsed_content.get("type") == "doc.v1" and "blocks" in parsed_content) or
                            ("blocks" in parsed_content and isinstance(parsed_content["blocks"], list))):
                            yield json.dumps({"type": "doc_v1", "data": parsed_content}) + '\n'
                        # Check for direct doc.v1 format with content (LLM streaming format)
                        elif (parsed_content.get("version") == "doc.v1" and 
                              "content" in parsed_content and isinstance(parsed_content["content"], list)):
                            # Validate content structure
                            try:
                                # Convert content to blocks format
                                doc_v1_data = {
                                    "type": "doc.v1",
                                    "blocks": parsed_content["content"]
                                }
                                # Validate the structure
                                if self._validate_doc_v1_structure(doc_v1_data):
                                    yield json.dumps({"type": "doc_v1", "data": doc_v1_data}) + '\n'
                                else:
                                    logger.warning("Invalid doc.v1 structure, sending as text")
                                    yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                            except Exception as e:
                                logger.error(f"Error processing doc.v1 content: {e}")
                                yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                        # Check for wrapped doc format with content
                        elif ("doc" in parsed_content and isinstance(parsed_content["doc"], dict) and
                              "content" in parsed_content["doc"] and isinstance(parsed_content["doc"]["content"], list)):
                            # Extract the doc content and convert to blocks format
                            doc_data = parsed_content["doc"]
                            doc_v1_data = {
                                "type": "doc.v1",
                                "blocks": doc_data["content"]
                            }
                            if "version" in doc_data:
                                doc_v1_data["version"] = doc_data["version"]
                            yield json.dumps({"type": "doc_v1", "data": doc_v1_data}) + '\n'
                        else:
                            yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                    else:
                        yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                except (json.JSONDecodeError, TypeError):
                    # Not JSON, send as regular text response
                    yield json.dumps({"type": "full_response", "data": full_reply_content}) + '\n'
                return

            full_tool_calls = sorted(tool_call_builders.values(), key=lambda x: x.get('index', 0))
            messages.append({"role": "assistant", "tool_calls": full_tool_calls, "content": None})  # Fix: content should be None for tool calls
            
            for tool_call in full_tool_calls:
                function_name = tool_call["function"]["name"]
                try:
                    function_args = json.loads(tool_call["function"].get("arguments") or "{}")
                    result = await self.tool_registry.call(function_name, **function_args)
                    # Fix: Safe serialization for tool_result
                    safe_result = json.dumps(result, default=str)
                    yield json.dumps({"type": "tool_result", "data": json.loads(safe_result)}) + '\n'
                    messages.append({
                        "tool_call_id": tool_call["id"], 
                        "role": "tool", 
                        "name": function_name, 
                        "content": safe_result
                    })
                except Exception as e:
                    error_message = f"Error calling tool {function_name}: {e}"
                    logger.error(error_message, exc_info=True)
                    yield json.dumps({"type": "error", "data": {"message": error_message}}) + '\n'
                    messages.append({
                        "tool_call_id": tool_call["id"], 
                        "role": "tool", 
                        "name": function_name, 
                        "content": json.dumps({"error": error_message})
                    })
            
            api_params["messages"] = messages

    async def process_chat_stream(
        self, 
        text: str, 
        user_id: str, 
        session_id: Optional[str] = None, 
        agent_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Process a chat stream request.
        
        Args:
            text: User's message text
            user_id: User identifier
            session_id: Optional session ID
            agent_id: Optional agent ID
            
        Yields:
            JSON strings with streaming events
        """
        logger.info(f"--- New General Chat Request ---")
        
        # Get or create session
        session = await self.get_session_from_redis(
            session_id or str(uuid.uuid4()), 
            user_id, 
            agent_id or "default"
        )
        
        # Add user message to session
        session.add_message(role="user", content=text)

        # Get personality configuration
        personality_config = personality_service.get_personality(session.agent_id) or {}
        system_prompt = personality_config.get("system_prompt", "You are a helpful assistant.")
        
        # Build prompt messages
        prompt_messages = [{"role": "system", "content": system_prompt}] + [m.model_dump() for m in session.short_term_memory]
        
        # Stream LLM response
        full_response = ""
        final_message = None  # Fix: Track what to save in history
        
        async for chunk in self.get_llm_response_stream(prompt_messages, session.persistent_session_id):
            yield chunk
            try:
                event = json.loads(chunk)
                if event.get("type") == "llm_chunk":
                    full_response += event.get("data", "")
                elif event.get("type") == "doc_v1":
                    # Fix: Store doc.v1 for final message
                    final_message = {
                        "content": json.dumps(event.get("data", {})),
                        "content_type": "doc.v1"
                    }
                elif event.get("type") == "full_response":
                    # Fix: Store full response for final message
                    final_message = {
                        "content": event.get("data", ""),
                        "content_type": "text.v1"
                    }
            except json.JSONDecodeError:
                pass

        # Add assistant response to session
        if final_message:
            # Fix: Use final_message instead of full_response
            session.add_message(
                role="assistant", 
                content=final_message["content"],
                content_type=final_message["content_type"]
            )
        elif full_response.strip():
            # Fallback to text if no structured message
            session.add_message(role="assistant", content=full_response.strip())

        # Save session first
        await self.save_session_to_redis(session)

        # Update STM after stream completion (write-after-final)
        if self.memory_service and full_response.strip():
            # Prepare recent messages for STM update
            recent_messages = [m.model_dump() for m in session.short_term_memory[-10:]]  # Last 10 messages
            
            # Use consider_update_stm which handles all the logic
            updated = await self.memory_service.consider_update_stm(
                session.persistent_session_id, recent_messages
            )
            
            if updated:
                logger.info("STM updated after chat stream completion", extra={
                    "session_id": session.persistent_session_id,
                    "message_count": len(recent_messages),
                    "token_count": sum(len(str(msg.get("content", ""))) for msg in recent_messages) // 4
                })

        # End stream
        yield json.dumps({"type": "end", "data": "Stream finished"}) + '\n'

    async def get_all_chats(self) -> List[Dict[str, Any]]:
        """
        Get all chat and study sessions.
        
        Returns:
            List of session dictionaries
        """
        logger.info("Fetching all chats and study sessions...")
        all_sessions = []
        
        if not self.redis_client:
            logger.warning("Redis client is None, cannot fetch sessions")
            return []
        
        try:
            # Get chat sessions
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
            logger.error(f"An error occurred while scanning for chat sessions: {e}", exc_info=True)

        # Get study sessions
        try:
            logger.info("Starting to scan for study sessions...")
            study_keys = [key async for key in self.redis_client.scan_iter("study:sess:*:top")]
            logger.info(f"Found {len(study_keys)} study session keys")
            for key in study_keys:
                try:
                    # Handle both bytes and string keys
                    key_str = key.decode() if isinstance(key, bytes) else key
                    session_id = key_str.split(':')[2]
                    
                    # Try to get snapshot data directly from Redis
                    snapshot_data = await self.redis_client.get(f"study:sess:{session_id}:top")
                    if snapshot_data:
                        snapshot = json.loads(snapshot_data)
                        ref = snapshot.get('ref', 'Study Session')
                        ts = snapshot.get('ts', 0)
                        all_sessions.append({
                            "session_id": session_id,
                            "name": ref,
                            "last_modified": datetime.fromtimestamp(ts).isoformat(),
                            "type": "study"
                        })
                except Exception as e:
                    logger.warning(f"Failed to process study session key {key}: {e}")
        except Exception as e:
            logger.error(f"An error occurred while scanning for study sessions: {e}", exc_info=True)

        # Sort by last modified
        sorted_sessions = sorted(
            [s for s in all_sessions if s.get("last_modified")], 
            key=lambda x: x["last_modified"], 
            reverse=True
        )
        return sorted_sessions

    async def delete_session(self, session_id: str, session_type: str) -> bool:
        """
        Delete a session by ID and type.
        
        Args:
            session_id: Session identifier
            session_type: Type of session ("chat" or "study")
            
        Returns:
            True if session was deleted successfully
        """
        if session_type == "chat":
            success = personality_service.delete_session(session_id)
            if not success:
                logger.warning(f"Chat session {session_id} not found for deletion")
            return success
        elif session_type == "study":
            keys_to_delete = [
                f"study:sess:{session_id}:history",       # legacy
                f"study:sess:{session_id}:history_list",  # NEW format
                f"study:sess:{session_id}:cursor", 
                f"study:sess:{session_id}:top"
            ]
            deleted_count = await self.redis_client.delete(*keys_to_delete)
            if deleted_count == 0:
                logger.warning(f"No study session keys found for deletion with ID: {session_id}")
            return deleted_count > 0
        else:
            logger.error(f"Unknown session type: {session_type}")
            return False
    
    async def get_chat_history(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get chat history for a specific session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of message dictionaries
        """
        if not self.redis_client:
            logger.warning("Redis client is None, cannot fetch chat history")
            return []
        
        try:
            redis_key = f"session:{session_id}"
            session_data = await self.redis_client.get(redis_key)
            if not session_data:
                logger.warning(f"Session {session_id} not found")
                return []
            
            session = json.loads(session_data)
            if not isinstance(session, dict) or "short_term_memory" not in session:
                logger.warning(f"Invalid session data for {session_id}")
                return []
            
            # Convert messages to frontend format
            messages = []
            for msg in session.get("short_term_memory", []):
                if isinstance(msg, dict):
                    messages.append({
                        "role": msg.get("role"),
                        "content": msg.get("content"),
                        "content_type": msg.get("content_type", "text.v1"),
                        "timestamp": msg.get("timestamp", msg.get("ts"))  # Try both timestamp and ts
                    })
            
            logger.info(f"Retrieved {len(messages)} messages for session {session_id}")
            return messages
            
        except Exception as e:
            logger.error(f"Failed to get chat history for session {session_id}: {e}", exc_info=True)
            return []
    
    async def get_llm_response_stream_with_blocks(
        self, 
        messages: List[Dict[str, Any]], 
        session_id: str
    ) -> AsyncGenerator[str, None]:
        """
        Generate LLM response stream with block-by-block streaming.
        
        Args:
            messages: List of message dictionaries
            session_id: Session ID for STM integration
            
        Yields:
            JSON strings with streaming events (including block events)
        """
        try:
            client, model, reasoning_params, caps = get_llm_for_task("CHAT")
        except LLMConfigError as e:
            yield json.dumps({"type": "error", "data": {"message": f"LLM not configured: {e}"}}) + '\n'
            return

        # Integrate STM if available
        if self.memory_service:
            stm_data = await self.memory_service.get_stm(session_id)
            if stm_data:
                # Use the new format_stm_for_prompt method
                stm_context = self.memory_service.format_stm_for_prompt(stm_data)
                if stm_context:
                    stm_message = {
                        "role": "system", 
                        "content": f"[STM Context]\n{stm_context}"
                    }
                    messages.insert(0, stm_message)

        tools = self.tool_registry.get_tool_schemas()
        api_params = {**reasoning_params, "model": model, "messages": messages, "stream": True}
        if tools:
            api_params.update({"tools": tools, "tool_choice": "auto"})

        try:
            stream = await client.chat.completions.create(**api_params)
            
            # Create a text stream generator
            async def text_stream():
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            
            # Stream blocks as they become available
            async for block_event in self.block_stream_service.stream_blocks_from_text(text_stream(), session_id):
                yield json.dumps(block_event) + '\n'
                
        except Exception as e:
            logger.error(f"Error in LLM stream with blocks: {e}", exc_info=True)
            yield json.dumps({"type": "error", "data": {"message": str(e)}}) + '\n'
    
    def _find_valid_json_prefix(self, buffer: str) -> tuple[Optional[Dict[str, Any]], int]:
        """
        Find the last valid JSON prefix in buffer.
        
        Returns:
            Tuple of (parsed_object, end_position) or (None, 0) if no valid prefix
        """
        if not buffer.strip():
            return None, 0
        
        # Try to find valid JSON prefix by testing progressively longer substrings
        max_pos = len(buffer)
        
        # Start from the end and work backwards to find the longest valid prefix
        for end_pos in range(max_pos, 0, -1):
            test_str = buffer[:end_pos].strip()
            if not test_str:
                continue
                
            try:
                # Try to parse as JSON
                obj = json.loads(test_str)
                if isinstance(obj, dict):
                    return obj, end_pos
            except json.JSONDecodeError:
                # Try to find a complete object within the string
                try:
                    # Look for complete objects by counting braces
                    brace_count = 0
                    start_pos = 0
                    in_string = False
                    escape_next = False
                    
                    for i, char in enumerate(test_str):
                        if escape_next:
                            escape_next = False
                            continue
                            
                        if char == '\\':
                            escape_next = True
                            continue
                            
                        if char == '"' and not escape_next:
                            in_string = not in_string
                            continue
                            
                        if not in_string:
                            if char == '{':
                                if brace_count == 0:
                                    start_pos = i
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    # Found complete object
                                    obj_str = test_str[start_pos:i+1]
                                    obj = json.loads(obj_str)
                                    if isinstance(obj, dict):
                                        return obj, start_pos + len(obj_str)
                    
                except (json.JSONDecodeError, ValueError):
                    continue
        
        return None, 0
    
    def _validate_doc_v1_structure(self, doc_data: Dict[str, Any]) -> bool:
        """
        Validate doc.v1 structure to ensure it's complete and valid.
        
        Args:
            doc_data: The doc.v1 data to validate
            
        Returns:
            True if structure is valid, False otherwise
        """
        try:
            # Check required fields
            if not isinstance(doc_data, dict):
                return False
            
            if "type" not in doc_data or doc_data["type"] != "doc.v1":
                return False
            
            if "blocks" not in doc_data or not isinstance(doc_data["blocks"], list):
                return False
            
            # Validate each block
            for block in doc_data["blocks"]:
                if not isinstance(block, dict):
                    return False
                
                if "type" not in block:
                    return False
                
                # Check for required content field
                if "content" not in block:
                    return False
                
                # Validate content based on type
                block_type = block["type"]
                content = block["content"]
                
                if block_type == "paragraph" and not isinstance(content, str):
                    return False
                elif block_type == "heading" and not isinstance(content, str):
                    return False
                elif block_type == "list" and not isinstance(content, list):
                    return False
                # Add more validations as needed
            
            return True
            
        except Exception as e:
            logger.error(f"Error validating doc.v1 structure: {e}")
            return False
    
    async def process_chat_stream_with_blocks(
        self, 
        text: str, 
        user_id: str, 
        session_id: Optional[str] = None, 
        agent_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Process a chat stream request with block-by-block streaming.
        
        Args:
            text: User's message text
            user_id: User identifier
            session_id: Optional session ID
            agent_id: Optional agent ID
            
        Yields:
            JSON strings with streaming events (including block events)
        """
        logger.info(f"--- New Block Streaming Chat Request ---")
        
        # Get or create session
        session = await self.get_session_from_redis(
            session_id or str(uuid.uuid4()), 
            user_id, 
            agent_id or "default"
        )
        
        # Add user message to session
        session.add_message(role="user", content=text)

        # Get personality configuration
        personality_config = personality_service.get_personality(session.agent_id) or {}
        system_prompt = personality_config.get("system_prompt", "You are a helpful assistant.")
        
        # Build prompt messages
        prompt_messages = [{"role": "system", "content": system_prompt}] + [m.model_dump() for m in session.short_term_memory]
        
        # Stream LLM response with block streaming
        full_response = ""
        final_message = None  # Fix: Track what to save in history
        block_doc = {"version": "1.0", "blocks": []}  # Fix: Aggregate blocks into doc
        block_ids = {}  # Fix: Track block_ids for stable keys
        
        async for chunk in self.get_llm_response_stream_with_blocks(prompt_messages, session.persistent_session_id):
            yield chunk
            try:
                event = json.loads(chunk)
                if event.get("type") == "llm_chunk":
                    full_response += event.get("data", "")
                elif event.get("type") == "block_start":
                    # Fix: Track block start with block_id
                    block_data = event.get("data", {})
                    block_index = block_data.get("block_index", 0)
                    block_type = block_data.get("block_type", "paragraph")
                    block_id = block_data.get("block_id", f"block_{block_index}")
                    block_ids[block_index] = block_id
                    # Ensure we have enough blocks in the array
                    while len(block_doc["blocks"]) <= block_index:
                        block_doc["blocks"].append({"type": block_type, "text": "", "block_id": block_id})
                elif event.get("type") == "block_delta":
                    # Fix: Update block content with block_id
                    block_data = event.get("data", {})
                    block_index = block_data.get("block_index", 0)
                    block = block_data.get("block", {})
                    if block_index < len(block_doc["blocks"]):
                        # Preserve block_id from block_start
                        block["block_id"] = block_ids.get(block_index, f"block_{block_index}")
                        block_doc["blocks"][block_index] = block
                elif event.get("type") == "block_end":
                    # Fix: Finalize block with block_id
                    block_data = event.get("data", {})
                    block_index = block_data.get("block_index", 0)
                    if block_index < len(block_doc["blocks"]):
                        block_doc["blocks"][block_index]["finalized"] = True
                        # Ensure block_id is preserved
                        if "block_id" not in block_doc["blocks"][block_index]:
                            block_doc["blocks"][block_index]["block_id"] = block_ids.get(block_index, f"block_{block_index}")
            except json.JSONDecodeError:
                pass

        # Add assistant response to session
        if block_doc["blocks"]:
            # Fix: Guarantee finalization of all blocks before saving
            for i, block in enumerate(block_doc["blocks"]):
                if "finalized" not in block:
                    block["finalized"] = True
                if "block_id" not in block:
                    block["block_id"] = block_ids.get(i, f"block_{i}")
            
            # Fix: Save aggregated doc.v1 with unified content_type
            final_message = {
                "content": json.dumps(block_doc),
                "content_type": "doc.v1"
            }
            session.add_message(
                role="assistant", 
                content=final_message["content"],
                content_type=final_message["content_type"]
            )
        elif full_response.strip():
            # Fallback to text if no blocks
            session.add_message(role="assistant", content=full_response.strip())

        # Save session first
        await self.save_session_to_redis(session)

        # Update STM after stream completion (write-after-final)
        if self.memory_service and (block_doc["blocks"] or full_response.strip()):
            # Prepare recent messages for STM update
            recent_messages = [m.model_dump() for m in session.short_term_memory[-10:]]  # Last 10 messages
            
            # Use consider_update_stm which handles all the logic
            updated = await self.memory_service.consider_update_stm(
                session.persistent_session_id, recent_messages
            )
            if updated:
                logger.info("STM updated after block streaming chat completion")


    def _text_to_async_generator(self, text: str) -> AsyncGenerator[str, None]:
        """Convert text to async generator for block streaming"""
        async def _gen():
            yield text
        return _gen()
    
    def _json_to_async_generator(self, json_obj: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        """Convert JSON object to async generator for block streaming"""
        async def _gen():
            yield json_obj
        return _gen()
