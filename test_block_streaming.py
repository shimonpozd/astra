#!/usr/bin/env python3
"""
Test script for block streaming functionality.
"""

import asyncio
import aiohttp
import json
import sys

async def test_block_streaming():
    """Test the block streaming endpoint"""
    
    url = "http://localhost:7030/api/chat/stream-blocks"
    
    payload = {
        "text": "Напиши краткое объяснение что такое Шаббат в виде структурированного документа с заголовками и абзацами",
        "user_id": "test_user",
        "session_id": "test_session_blocks",
        "agent_id": "default"
    }
    
    print("Testing block streaming endpoint...")
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("-" * 50)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                print(f"Status: {response.status}")
                
                if response.status != 200:
                    print(f"Error: {response.status}")
                    text = await response.text()
                    print(f"Response: {text}")
                    return
                
                print("Streaming response:")
                print("-" * 30)
                
                async for line in response.content:
                    if line:
                        try:
                            # Decode the line
                            line_str = line.decode('utf-8').strip()
                            if line_str:
                                # Parse JSON
                                event = json.loads(line_str)
                                event_type = event.get('type', 'unknown')
                                
                                if event_type == 'block':
                                    data = event.get('data', {})
                                    block_index = data.get('block_index', 0)
                                    block_type = data.get('block_type', 'unknown')
                                    content = data.get('content', {})
                                    
                                    print(f"BLOCK {block_index} ({block_type}): {json.dumps(content, ensure_ascii=False, indent=2)}")
                                    
                                else:
                                    print(f"EVENT ({event_type}): {json.dumps(event, ensure_ascii=False, indent=2)}")
                                    
                        except json.JSONDecodeError as e:
                            print(f"JSON Error: {e}")
                            print(f"Raw line: {line_str}")
                        except Exception as e:
                            print(f"Error processing line: {e}")
                            print(f"Raw line: {line_str}")
                
                print("-" * 30)
                print("Stream completed!")
                
    except Exception as e:
        print(f"Request failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_block_streaming())























