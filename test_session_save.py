#!/usr/bin/env python3
import asyncio
import redis.asyncio as redis
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def test_session_save():
    """Test session saving to Redis"""
    print("Testing session save to Redis...")
    
    # Connect to Redis
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    
    try:
        # Test Redis connection
        await redis_client.ping()
        print("✅ Redis connection successful")
        
        # Test saving a simple session
        test_session = {
            "user_id": "test-user-123",
            "agent_id": "default",
            "persistent_session_id": "test-session-123",
            "short_term_memory": [
                {
                    "role": "user",
                    "content": "Hello, how are you?",
                    "content_type": "text.v1",
                    "timestamp": "2025-01-01T12:00:00"
                }
            ],
            "last_modified": "2025-01-01T12:00:00"
        }
        
        # Save session
        redis_key = f"session:test-session-123"
        await redis_client.set(redis_key, json.dumps(test_session), ex=3600 * 24 * 7)
        print(f"✅ Session saved to key: {redis_key}")
        
        # Check if it was saved
        saved_data = await redis_client.get(redis_key)
        if saved_data:
            print("✅ Session retrieved successfully")
            print(f"Data: {saved_data[:100]}...")
        else:
            print("❌ Session not found after saving")
        
        # List all session keys
        session_keys = await redis_client.keys("session:*")
        print(f"All session keys: {session_keys}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await redis_client.close()

if __name__ == "__main__":
    asyncio.run(test_session_save())




