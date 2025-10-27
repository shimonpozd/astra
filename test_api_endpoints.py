#!/usr/bin/env python3
"""
Test API endpoints to verify they work.
"""

import asyncio
import aiohttp
import json

async def test_endpoints():
    """Test various API endpoints"""
    
    base_url = "http://localhost:7030"
    
    # Test health
    print("Testing health...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{base_url}/health") as response:
                print(f"Health status: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"Health result: {result}")
    except Exception as e:
        print(f"Health error: {e}")
    
    # Test chat stream
    print("\nTesting chat stream...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{base_url}/api/chat/stream",
                json={"text": "Hello", "user_id": "test"}
            ) as response:
                print(f"Chat stream status: {response.status}")
                if response.status == 200:
                    print("Chat stream working!")
                else:
                    text = await response.text()
                    print(f"Chat stream error: {text}")
    except Exception as e:
        print(f"Chat stream error: {e}")
    
    # Test study state
    print("\nTesting study state...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{base_url}/api/study/state",
                params={"session_id": "test"}
            ) as response:
                print(f"Study state status: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"Study state result: {result}")
                else:
                    text = await response.text()
                    print(f"Study state error: {text}")
    except Exception as e:
        print(f"Study state error: {e}")
    
    # Test study set_focus
    print("\nTesting study set_focus...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{base_url}/api/study/set_focus",
                json={"session_id": "test", "ref": "Shabbat 2a"}
            ) as response:
                print(f"Study set_focus status: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"Study set_focus result: {result}")
                else:
                    text = await response.text()
                    print(f"Study set_focus error: {text}")
    except Exception as e:
        print(f"Study set_focus error: {e}")

if __name__ == "__main__":
    asyncio.run(test_endpoints())





















