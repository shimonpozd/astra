import os,sys
sys.path.append(os.path.abspath('.'))
sys.path.append(os.path.abspath('brain_service'))
import asyncio,httpx
from config import get_config_section
from brain_service.services.study.service import StudyService as ModularStudyService
from brain_service.services.sefaria_service import SefariaService
from brain_service.services.sefaria_index_service import SefariaIndexService
from brain_service.services.study.config_schema import load_study_config
async def main():
    cfg = get_config_section('services.brain.sefaria', {}) or {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        index = SefariaIndexService(client, cfg.get('api_url', 'https://www.sefaria.org/api/'), cfg.get('api_key'))
        await index.load()
        sefaria = SefariaService(client, None, cfg.get('api_url', 'https://www.sefaria.org/api/'), cfg.get('api_key'), cache_ttl_sec=60)
        modular = ModularStudyService(sefaria, index, None, load_study_config(None))
        res = await modular.get_text_with_window('Exodus 2:1', window_size=2)
        print('modular segments', len(res['segments']))
        for seg in res['segments']: print(seg['ref'])
asyncio.run(main())
