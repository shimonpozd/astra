#!/usr/bin/env python3
"""
Проверяем, есть ли Rashi в bookshelf
"""
import asyncio
import json
import requests

async def test_bookshelf_check():
    # Создаем study сессию
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
    
    # Получаем bookshelf
    print("\nGetting bookshelf...")
    response = requests.post("http://localhost:7030/study/bookshelf", json={
        "session_id": session_id,
        "ref": "Genesis 1:1"
    })
    print(f"Bookshelf status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error: {response.text}")
        return
    
    bookshelf_data = response.json()
    print(f"Bookshelf OK: {bookshelf_data.get('ok')}")
    print(f"Bookshelf data keys: {list(bookshelf_data.keys())}")
    
    if bookshelf_data.get('ok') and bookshelf_data.get('bookshelf'):
        items = bookshelf_data['bookshelf'].get('items', [])
        print(f"Bookshelf items count: {len(items)}")
        
        # Показываем первые несколько items
        print("First 5 items:")
        for item in items[:5]:
            print(f"  - {item.get('ref')} (commentator: {item.get('commentator')})")
        
        # Ищем Rashi
        rashi_items = [item for item in items if 'Rashi' in item.get('ref', '')]
        print(f"Rashi items found: {len(rashi_items)}")
        
        for item in rashi_items[:3]:  # Показываем первые 3
            print(f"  - {item.get('ref')} (commentator: {item.get('commentator')})")
        
        # Ищем конкретно "Rashi on Genesis 1:1:1"
        target_ref = "Rashi on Genesis 1:1:1"
        target_item = next((item for item in items if item.get('ref') == target_ref), None)
        
        if target_item:
            print(f"\nFound target item: {target_ref}")
            print(f"  text_full length: {len(target_item.get('text_full', ''))}")
            print(f"  heTextFull length: {len(target_item.get('heTextFull', ''))}")
        else:
            print(f"\nTarget item NOT found: {target_ref}")
            # Показываем похожие
            similar = [item for item in items if 'Rashi' in item.get('ref', '') and 'Genesis 1:1' in item.get('ref', '')]
            print(f"Similar items: {len(similar)}")
            for item in similar:
                print(f"  - {item.get('ref')}")

if __name__ == "__main__":
    asyncio.run(test_bookshelf_check())
