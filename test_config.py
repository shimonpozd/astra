#!/usr/bin/env python3
import os
import sys

# Set the environment variable before importing brain_service modules
os.environ["ASTRA_CONFIG_ENABLED"] = "true"

# Add brain_service to path
sys.path.insert(0, "brain_service")

try:
    from core.llm_config import get_llm_for_task, USE_ASTRA_CONFIG, LLM_CONFIG
    print(f"USE_ASTRA_CONFIG: {USE_ASTRA_CONFIG}")
    print(f"LLM_CONFIG keys: {list(LLM_CONFIG.keys())}")
    
    # Try to get translator config
    try:
        client, model, reasoning_params, capabilities = get_llm_for_task('TRANSLATOR')
        print(f"TRANSLATOR model: {model}")
        print(f"TRANSLATOR capabilities: {capabilities}")
        print("SUCCESS: TRANSLATOR task configured correctly")
    except Exception as e:
        print(f"ERROR: TRANSLATOR task failed: {e}")
        
except Exception as e:
    print(f"ERROR: Failed to import or test: {e}")
