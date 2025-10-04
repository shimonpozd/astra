#!/usr/bin/env python3
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, '.')

from brain.llm_config import get_llm_for_task

def test_llm_config():
    """Test LLM configuration for different tasks"""
    print("Testing LLM config...")
    
    # Test CHAT task
    try:
        client, model, params, caps = get_llm_for_task('CHAT')
        print(f"OK CHAT: {model}")
        print(f"   Params: {params}")
        print(f"   Caps: {caps}")
    except Exception as e:
        print(f"ERROR CHAT: {e}")
    
    # Test STUDY task
    try:
        client, model, params, caps = get_llm_for_task('STUDY')
        print(f"OK STUDY: {model}")
        print(f"   Params: {params}")
        print(f"   Caps: {caps}")
    except Exception as e:
        print(f"ERROR STUDY: {e}")

if __name__ == "__main__":
    test_llm_config()
