#!/usr/bin/env python3
"""
Тест для установки workbench item и проверки его содержимого
"""
import asyncio
import json
import requests

async def test_workbench_set():
    # Создаем новую study сессию
    import uuid
    session_id = str(uuid.uuid4())
    print(f"Creating study session with ID: {session_id}")
    
    response = requests.post("http://localhost:7030/study/set_focus", json={
        "session_id": session_id,
        "ref": "Genesis 1:1"
    })
    print(f"Set focus status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error: {response.text}")
        return
    
    focus_data = response.json()
    print(f"Focus response OK: {focus_data.get('ok')}")
    if focus_data.get('state'):
        state = focus_data['state']
        print(f"State ref: {state.get('ref')}")
        print(f"State bookshelf items: {len(state.get('bookshelf', {}).get('items', []))}")
    
    # Устанавливаем workbench item
    print("\nSetting workbench item...")
    response = requests.post("http://localhost:7030/study/workbench/set", json={
        "session_id": session_id,
        "ref": "Abarbanel on Torah, Genesis 1:1:1",
        "slot": "left"
    })
    print(f"Set workbench status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error: {response.text}")
        return
    
    workbench_data = response.json()
    print(f"Workbench response OK: {workbench_data.get('ok')}")
    print(f"Workbench error: {workbench_data.get('error')}")
    
    # Проверяем содержимое workbench
    if workbench_data.get("ok") and workbench_data.get("state"):
        state = workbench_data["state"]
        workbench = state.get("workbench", {})
        
        print(f"\n=== Workbench Contents ===")
        for slot, item in workbench.items():
            if item:
                print(f"\nSlot {slot}:")
                if isinstance(item, str):
                    print(f"  String: {item}")
                else:
                    print(f"  Type: {type(item)}")
                    if hasattr(item, '__dict__'):
                        print(f"  Attributes:")
                        for key, value in item.__dict__.items():
                            if key in ['text_full', 'heTextFull', 'ref', 'commentator']:
                                val_str = str(value)[:100] if isinstance(value, str) and len(str(value)) > 100 else str(value)
                                print(f"    {key}: {val_str}")
                    elif isinstance(item, dict):
                        print(f"  Dictionary keys: {list(item.keys())}")
                        for key in ['text_full', 'heTextFull', 'ref', 'commentator']:
                            if key in item:
                                val = item[key]
                                if isinstance(val, str):
                                    val_str = f"Length: {len(val)}" if len(val) > 0 else "Empty"
                                else:
                                    val_str = str(val)
                                print(f"    {key}: {val_str}")
                    else:
                        print(f"  Value: {str(item)[:100]}")

if __name__ == "__main__":
    asyncio.run(test_workbench_set())
