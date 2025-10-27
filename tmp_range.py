import sys
from pathlib import Path
sys.path.insert(0, str(Path('brain_service').resolve()))
import asyncio
import httpx
import json
from services.sefaria_service import SefariaService
from core.settings import Settings

async def main():
    settings = Settings()
    async with httpx.AsyncClient() as client:
        service = SefariaService(client, None, settings.SEFARIA_API_URL, settings.SEFARIA_API_KEY, cache_ttl_sec=60)
        res = await service.get_text('Genesis 1:1-4')
        with open('tmp_range_output.json', 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=2)

asyncio.run(main())
