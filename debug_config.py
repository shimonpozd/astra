#!/usr/bin/env python3
import os
import sys

# Set the environment variable before importing brain_service modules
os.environ["ASTRA_CONFIG_ENABLED"] = "true"

# Add brain_service to path
sys.path.insert(0, "brain_service")

try:
    from core.llm_config import get_llm_for_task, USE_ASTRA_CONFIG, LLM_CONFIG, _get_model_from_config, _get_api_section
    
    print(f"USE_ASTRA_CONFIG: {USE_ASTRA_CONFIG}")
    print(f"LLM_CONFIG keys: {list(LLM_CONFIG.keys())}")
    
    # Check overrides
    overrides = LLM_CONFIG.get("overrides", {})
    print(f"Overrides: {overrides}")
    
    # Check translator override
    translator_model = _get_model_from_config('TRANSLATOR')
    print(f"Translator model from config: {translator_model}")
    
    # Check API section
    openrouter_api = _get_api_section("openrouter")
    print(f"OpenRouter API config: {openrouter_api}")
    
    # Check if model starts with openrouter
    if translator_model and translator_model.startswith("openrouter/"):
        print("Model starts with openrouter/ - should use OpenRouter client")
    else:
        print(f"Model does not start with openrouter/: {translator_model}")
        
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
