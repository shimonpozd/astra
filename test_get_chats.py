#!/usr/bin/env python3
import requests
import sys

sys.stdout.reconfigure(encoding='utf-8')

def test_get_chats():
    """Test getting all chats"""
    print("Testing GET /chats...")
    
    try:
        response = requests.get("http://localhost:7030/chats")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}")
            print(f"Number of chats: {len(data)}")
            
            # Check if our test session is there
            test_session = next((s for s in data if s.get("session_id") == "test-session-123"), None)
            if test_session:
                print("✅ Test session found in response")
            else:
                print("❌ Test session NOT found in response")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_get_chats()




