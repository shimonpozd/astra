#!/usr/bin/env python3
import requests
import sys

sys.stdout.reconfigure(encoding='utf-8')

def test_admin_config():
    """Test admin config API"""
    print("Testing admin config...")
    
    try:
        response = requests.get("http://localhost:7030/admin/config/public")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("LLM config:")
            if 'llm' in data:
                llm = data['llm']
                print(f"  Provider: {llm.get('provider', 'Not set')}")
                print(f"  Model: {llm.get('model', 'Not set')}")
                if 'overrides' in llm:
                    print(f"  Overrides: {llm['overrides']}")
            else:
                print("  No LLM config found")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_admin_config()





















