#!/usr/bin/env python3
"""
Simple test for study API.
"""

import asyncio
import aiohttp
import json

async def test_simple_study():
    """Test study API endpoints"""
    
    # Test set_focus
    focus_url = "http://localhost:7030/api/study/set_focus"
    focus_payload = {
        "session_id": "test_session_simple",
        "ref": "Shabbat 2a"
    }
    
    print("Testing set_focus...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(focus_url, json=focus_payload) as response:
                print(f"Focus status: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"Focus result: {result}")
                else:
                    text = await response.text()
                    print(f"Focus error: {text}")
    except Exception as e:
        print(f"Focus exception: {e}")
    
    # Test state
    state_url = "http://localhost:7030/api/study/state"
    state_params = {"session_id": "test_session_simple"}
    
    print("\nTesting state...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(state_url, params=state_params) as response:
                print(f"State status: {response.status}")
                if response.status == 200:
                    result = await response.json()
                    print(f"State result: {result}")
                else:
                    text = await response.text()
                    print(f"State error: {text}")
    except Exception as e:
        print(f"State exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_simple_study())





















