import sys
from pathlib import Path
sys.path.insert(0, str(Path('brain_service').resolve()))
import asyncio
import json
import httpx
import redis.asyncio as redis
from services.sefaria_service import SefariaService
from services.sefaria_index_service import SefariaIndexService
from services.study.daily_loader import DailyLoader
from services.study.redis_repo import StudyRedisRepository
from services.study.config_schema import load_study_config
from config import get_config

async def main():
    full_config = get_config(force_reload=True)
    study_raw = full_config.get('study')
    study_config = load_study_config(study_raw)
    async with httpx.AsyncClient() as client:
        redis_client = redis.from_url('redis://localhost:6379/0', decode_responses=True)
        sefaria_service = SefariaService(client, redis_client, 'https://www.sefaria.org/api/', None, cache_ttl_sec=60)
        index_service = SefariaIndexService(http_client=client, sefaria_api_url='https://www.sefaria.org/api/', sefaria_api_key=None)
        await index_service.load()
        repo = StudyRedisRepository(redis_client)
        loader = DailyLoader(sefaria_service, index_service, repo, study_config)
        result = await loader.load_initial(ref='Genesis 1', session_id='daily-debug-inspect', ttl_seconds=600)
        print('total_segments', result['total_segments'])
        print('loaded', result['loaded'])
        print('remaining len', len(result['remaining_plan']))
        print(json.dumps(result['remaining_plan'][:3], indent=2))

asyncio.run(main())
