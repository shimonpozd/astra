#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def test_study_chat_fixed():
    """Test study chat with fixed message saving"""
    print("Testing study chat with fixed message saving...")
    
    async with aiohttp.ClientSession() as session:
        try:
            session_id = "test-study-session-fixed"
            
            # 1. Set focus to create study state
            print("1. Setting study focus...")
            focus_url = "http://localhost:7030/study/set_focus"
            focus_data = {
                "session_id": session_id,
                "ref": "Shabbat 2a"
            }
            
            async with session.post(focus_url, json=focus_data) as response:
                print(f"✅ Focus response status: {response.status}")
                if response.status != 200:
                    error_text = await response.text()
                    print(f"❌ Focus failed: {error_text}")
                    return
            
            # 2. Send study chat
            print("\n2. Sending study chat...")
            chat_url = "http://localhost:7030/study/chat"
            chat_data = {
                "session_id": session_id,
                "text": "What is this text about?"
            }
            
            async with session.post(chat_url, json=chat_data) as response:
                print(f"✅ Chat response status: {response.status}")
                if response.status == 200:
                    print("✅ Study chat successful!")
                    
                    # Read streaming response
                    async for line in response.content:
                        if line:
                            line_str = line.decode('utf-8').strip()
                            if line_str:
                                print(f"📝 Stream: {line_str}")
                else:
                    error_text = await response.text()
                    print(f"❌ Chat failed: {error_text}")
                    return
            
            # 3. Check study state after chat
            print("\n3. Checking study state after chat...")
            state_url = f"http://localhost:7030/study/state?session_id={session_id}"
            async with session.get(state_url) as response:
                print(f"✅ State response status: {response.status}")
                if response.status == 200:
                    state_result = await response.json()
                    if state_result.get("ok") and state_result.get("state"):
                        state = state_result["state"]
                        chat_local = state.get("chat_local", [])
                        print(f"✅ Chat local messages: {len(chat_local)}")
                        for i, msg in enumerate(chat_local):
                            role = msg.get('role', 'unknown')
                            content = msg.get('content', '')
                            content_type = msg.get('content_type', 'unknown')
                            print(f"  {i+1}. {role} ({content_type}): {content[:100]}...")
                    else:
                        print("❌ No study state found")
                else:
                    error_text = await response.text()
                    print(f"❌ State failed: {error_text}")
                    
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_study_chat_fixed())























