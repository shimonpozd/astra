#!/usr/bin/env python3
import requests
import json
import sys

# Set UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

# Test chat API
url = "http://localhost:7030/chat/stream"
data = {
    "session_id": "test-session-123",
    "user_id": "test-user-123",
    "text": "Hello, how are you?"
}

print("Testing chat API...")
print(f"URL: {url}")
print(f"Data: {data}")

try:
    response = requests.post(url, json=data, stream=True)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        print("Response chunks:")
        try:
            for i, chunk in enumerate(response.iter_lines()):
                if chunk:
                    chunk_text = chunk.decode('utf-8')
                    print(f"Chunk {i}: {chunk_text}")
                    if i > 5:  # Limit output
                        print("... (truncated)")
                        break
        except Exception as e:
            print(f"Error reading chunks: {e}")
    else:
        print(f"Error: {response.text}")
        
except Exception as e:
    print(f"Exception: {e}")
