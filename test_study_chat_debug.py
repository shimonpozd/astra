#!/usr/bin/env python3
"""
Test script to debug study chat message saving
"""

import asyncio
import aiohttp
import json
import sys

async def test_study_chat_debug():
    """Test study chat with detailed debugging"""
    
    base_url = "http://localhost:7030"
    session_id = "test-session-debug"
    
    print("Testing study chat with detailed debugging...")
    
    async with aiohttp.ClientSession() as session:
        # 1. Set study focus
        print("\n1. Setting study focus...")
        focus_data = {
            "session_id": session_id,
            "ref": "Shabbat 2a"
        }
        
        try:
            async with session.post(f"{base_url}/study/set_focus", json=focus_data) as resp:
                print(f"Focus response status: {resp.status}")
                if resp.status != 200:
                    text = await resp.text()
                    print(f"Focus error: {text}")
                    return
        except Exception as e:
            print(f"Focus request failed: {e}")
            return
        
        # 2. Send study chat
        print("\n2. Sending study chat...")
        chat_data = {
            "session_id": session_id,
            "text": "What is this text about?"
        }
        
        try:
            async with session.post(f"{base_url}/study/chat", json=chat_data) as resp:
                print(f"Chat response status: {resp.status}")
                if resp.status != 200:
                    text = await resp.text()
                    print(f"Chat error: {text}")
                    return
                
                # Read stream
                print("Stream events:")
                chunk_count = 0
                doc_v1_count = 0
                full_response = ""
                
                async for line in resp.content:
                    if line:
                        try:
                            event = json.loads(line.decode('utf-8'))
                            event_type = event.get("type", "unknown")
                            print(f"Event {chunk_count}: {event_type}")
                            
                            if event_type == "llm_chunk":
                                chunk_count += 1
                                data = event.get("data", "")
                                full_response += data
                                print(f"   Chunk {chunk_count}: {len(data)} chars")
                                
                            elif event_type == "doc_v1":
                                doc_v1_count += 1
                                print(f"   Doc.v1 event {doc_v1_count}")
                                
                            elif event_type == "tool_result":
                                print(f"   Tool result")
                                
                            elif event_type == "error":
                                print(f"   Error: {event.get('data', {})}")
                                
                        except json.JSONDecodeError as e:
                            print(f"   JSON decode error: {e}")
                            print(f"   Raw line: {line.decode('utf-8', errors='ignore')}")
                
                print(f"\nStream summary:")
                print(f"   - Total chunks: {chunk_count}")
                print(f"   - Doc.v1 events: {doc_v1_count}")
                print(f"   - Full response length: {len(full_response)}")
                
                # Check if response looks like JSON
                if full_response.strip().startswith('{'):
                    try:
                        parsed = json.loads(full_response)
                        print(f"   - Response is valid JSON: {type(parsed)}")
                        if isinstance(parsed, dict):
                            print(f"   - JSON keys: {list(parsed.keys())}")
                    except json.JSONDecodeError:
                        print(f"   - Response looks like JSON but is invalid")
                
        except Exception as e:
            print(f"Chat request failed: {e}")
            return
        
        # 3. Check study state
        print("\n3. Checking study state...")
        try:
            async with session.get(f"{base_url}/study/state?session_id={session_id}") as resp:
                print(f"State response status: {resp.status}")
                if resp.status == 200:
                    state = await resp.json()
                    chat_local = state.get("chat_local", [])
                    print(f"Chat local messages: {len(chat_local)}")
                    
                    if chat_local:
                        print("Chat messages:")
                        for i, msg in enumerate(chat_local):
                            role = msg.get("role", "unknown")
                            content = msg.get("content", "")
                            content_type = msg.get("content_type", "unknown")
                            print(f"   {i+1}. {role} ({content_type}): {len(content)} chars")
                    else:
                        print("No chat messages found!")
                        
        except Exception as e:
            print(f"State request failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_study_chat_debug())
