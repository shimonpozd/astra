import sys
from pathlib import Path
root = Path('.').resolve()
sys.path.append(str(root / 'brain_service'))
sys.path.append(str(root))
import asyncio
import json
import httpx
import redis.asyncio as redis
from core.settings import Settings
from services.sefaria_service import SefariaService
from services.sefaria_index_service import SefariaIndexService
from services.study.daily_loader import DailyLoader
from services.study.redis_repo import StudyRedisRepository

async def main():
    settings = Settings()
    async with httpx.AsyncClient() as client:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        sefaria_service = SefariaService(client, redis_client, settings.SEFARIA_API_URL, settings.SEFARIA_API_KEY, cache_ttl_sec=60)
        index_service = SefariaIndexService(http_client=client, sefaria_api_url=settings.SEFARIA_API_URL, sefaria_api_key=settings.SEFARIA_API_KEY)
        await index_service.load()
        repo = StudyRedisRepository(redis_client)
        loader = DailyLoader(sefaria_service, index_service, repo, settings.STUDY_CONFIG)
        result = await loader.load_initial(ref='Genesis 1', session_id='daily-debug-cli', ttl_seconds=600)
        print(json.dumps(result, ensure_ascii=False, indent=2))

asyncio.run(main())
