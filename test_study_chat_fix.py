#!/usr/bin/env python3
"""
Test script to verify the study chat message saving fix.
"""

import asyncio
import aiohttp
import json
import sys

async def test_study_chat():
    """Test study chat message saving"""
    
    # First, set focus
    focus_url = "http://localhost:7030/api/study/set_focus"
    focus_payload = {
        "session_id": "test_session_fix",
        "ref": "Shabbat 2a"
    }
    
    print("Setting focus...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(focus_url, json=focus_payload) as response:
                if response.status != 200:
                    print(f"Focus failed: {response.status}")
                    return
                print("Focus set successfully")
    except Exception as e:
        print(f"Focus error: {e}")
        return
    
    # Now send a chat message
    chat_url = "http://localhost:7030/api/study/chat"
    chat_payload = {
        "session_id": "test_session_fix",
        "text": "Объясни этот текст"
    }
    
    print("\nSending chat message...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(chat_url, json=chat_payload) as response:
                print(f"Chat status: {response.status}")
                
                if response.status != 200:
                    text = await response.text()
                    print(f"Chat error: {text}")
                    return
                
                print("Chat response received!")
                
                # Read the stream
                async for line in response.content:
                    if line:
                        try:
                            line_str = line.decode('utf-8').strip()
                            if line_str:
                                event = json.loads(line_str)
                                event_type = event.get('type', 'unknown')
                                print(f"Event: {event_type}")
                                
                                if event_type == 'llm_chunk':
                                    data = event.get('data', {})
                                    content = data.get('content', '') if isinstance(data, dict) else str(data)
                                    print(f"Chunk: {content[:50]}...")
                                    
                        except json.JSONDecodeError:
                            pass
                        except Exception as e:
                            print(f"Error: {e}")
                
    except Exception as e:
        print(f"Chat error: {e}")
        return
    
    # Check the state to see if messages were saved
    state_url = "http://localhost:7030/api/study/state"
    state_params = {"session_id": "test_session_fix"}
    
    print("\nChecking study state...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(state_url, params=state_params) as response:
                if response.status == 200:
                    state = await response.json()
                    if state.get('ok'):
                        chat_local = state.get('state', {}).get('chat_local', [])
                        print(f"Chat local messages: {len(chat_local)}")
                        for i, msg in enumerate(chat_local):
                            print(f"Message {i}: {msg.get('role')} - {len(str(msg.get('content', '')))} chars")
                    else:
                        print(f"State error: {state.get('error')}")
                else:
                    print(f"State status: {response.status}")
                    
    except Exception as e:
        print(f"State error: {e}")

if __name__ == "__main__":
    asyncio.run(test_study_chat())























