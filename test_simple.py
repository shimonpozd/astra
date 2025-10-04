#!/usr/bin/env python3
"""
Simple test for chat endpoint.
"""

import asyncio
import aiohttp
import json

async def test_simple():
    """Test the simple chat endpoint"""
    
    url = "http://localhost:7030/api/chat/stream"
    
    payload = {
        "text": "Hello",
        "user_id": "test",
        "session_id": "test"
    }
    
    print("Testing simple chat endpoint...")
    print(f"URL: {url}")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                print(f"Status: {response.status}")
                
                if response.status != 200:
                    print(f"Error: {response.status}")
                    text = await response.text()
                    print(f"Response: {text}")
                    return
                
                print("Response received!")
                
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_simple())




