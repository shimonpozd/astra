#!/usr/bin/env python3
import requests
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

def test_chat_detailed():
    """Test chat with detailed logging"""
    print("Testing chat with detailed logging...")
    
    url = "http://localhost:7030/chat/stream"
    data = {
        "session_id": "test-session-detailed",
        "user_id": "test-user-detailed",
        "text": "Hello, can you respond with a simple greeting?"
    }
    
    print(f"URL: {url}")
    print(f"Data: {data}")
    
    try:
        response = requests.post(url, json=data, stream=True)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print("Response chunks:")
            chunk_count = 0
            for chunk in response.iter_lines():
                if chunk:
                    chunk_text = chunk.decode('utf-8')
                    print(f"Chunk {chunk_count}: {chunk_text}")
                    
                    # Try to parse as JSON
                    try:
                        event = json.loads(chunk_text)
                        print(f"  -> Event type: {event.get('type')}")
                        if event.get('type') == 'error':
                            print(f"  -> Error: {event.get('data', {}).get('message')}")
                    except json.JSONDecodeError:
                        print(f"  -> Not JSON: {chunk_text[:50]}...")
                    
                    chunk_count += 1
                    if chunk_count > 20:  # Limit output
                        print("... (truncated)")
                        break
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_chat_detailed()





















