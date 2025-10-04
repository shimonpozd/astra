#!/usr/bin/env python3
import os
import sys
import asyncio
import json

# Set the environment variable before importing brain_service modules
os.environ["ASTRA_CONFIG_ENABLED"] = "true"

# Add brain_service to path
sys.path.insert(0, "brain_service")

async def test_translation():
    try:
        from services.sefaria_service import SefariaService
        from services.translation_service import TranslationService
        import httpx
        import redis.asyncio as redis
        
        # Create services
        http_client = httpx.AsyncClient()
        redis_client = redis.Redis.from_url("redis://localhost:6379/0")
        sefaria_service = SefariaService(http_client, redis_client, "https://www.sefaria.org/api/", "")
        translation_service = TranslationService(sefaria_service)
        
        # Test sefaria service directly
        print("Testing sefaria_service.get_text...")
        text_result = await sefaria_service.get_text("Shabbat 15a:3")
        print(f"text_result type: {type(text_result)}")
        print(f"text_result: {json.dumps(text_result, indent=2, ensure_ascii=False)}")
        
        # Test translation service
        print("\nTesting translation_service.translate_text_reference...")
        async for event in translation_service.translate_text_reference("Shabbat 15a:3"):
            print(f"Translation event: {event}")
            break  # Just get the first event
        
        await http_client.aclose()
        await redis_client.aclose()
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_translation())
