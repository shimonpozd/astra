#!/usr/bin/env python3
"""
Тест для отладки workbench - проверяем, что содержится в item
"""
import asyncio
import json
import redis.asyncio as redis
from brain.study_state import get_current_snapshot

async def test_workbench_debug():
    # Подключаемся к Redis
    redis_client = redis.from_url("redis://localhost:6379/0", decode_responses=True)
    
    # Получаем все ключи study sessions
    keys = await redis_client.keys("study_session:*")
    print(f"Found {len(keys)} study sessions")
    
    if not keys:
        print("No study sessions found")
        return
    
    # Берем первую сессию
    session_id = keys[0].replace("study_session:", "")
    print(f"Testing session: {session_id}")
    
    # Получаем snapshot
    snapshot = await get_current_snapshot(session_id, redis_client)
    if not snapshot:
        print("No snapshot found")
        return
    
    print(f"Snapshot found: {snapshot.ref}")
    print(f"Bookshelf items: {len(snapshot.bookshelf.items) if snapshot.bookshelf and snapshot.bookshelf.items else 0}")
    
    # Проверяем workbench
    if snapshot.workbench:
        print(f"Workbench slots: {list(snapshot.workbench.keys())}")
        
        for slot, item in snapshot.workbench.items():
            if item:
                print(f"\n=== Workbench {slot} ===")
                if isinstance(item, str):
                    print(f"Item is string: {item}")
                else:
                    print(f"Item type: {type(item)}")
                    if hasattr(item, '__dict__'):
                        print(f"Item attributes: {item.__dict__}")
                    else:
                        print(f"Item: {item}")
    else:
        print("No workbench items")
    
    await redis_client.aclose()

if __name__ == "__main__":
    asyncio.run(test_workbench_debug())





