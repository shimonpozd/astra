#!/usr/bin/env python3
import sys
import os
sys.stdout.reconfigure(encoding='utf-8')

# Simulate the same path logic as SummaryService
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "brain_service", "services", "..", ".."))
print(f"Project root: {project_root}")
print(f"Current sys.path: {sys.path[:3]}...")

if project_root not in sys.path:
    sys.path.insert(0, project_root)
    print(f"Added to sys.path: {project_root}")

print(f"Updated sys.path: {sys.path[:3]}...")

# Test import
try:
    from config.prompts import get_prompt
    print("✅ Import successful")
    
    # Test getting the prompt
    prompt_data = get_prompt("actions.summary_system")
    print(f"✅ Prompt loaded: {bool(prompt_data)}")
    if prompt_data:
        print(f"Prompt text length: {len(prompt_data.get('text', ''))}")
    
except Exception as e:
    print(f"❌ Import failed: {e}")
    import traceback
    traceback.print_exc()




