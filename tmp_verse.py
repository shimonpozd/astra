import sys
from pathlib import Path
root = Path('brain_service').resolve()
sys.path.insert(0, str(root))
import asyncio
import httpx
from services.sefaria_service import SefariaService
from core.settings import Settings

async def main():
    settings = Settings()
    async with httpx.AsyncClient() as client:
        service = SefariaService(client, None, settings.SEFARIA_API_URL, settings.SEFARIA_API_KEY, cache_ttl_sec=60)
        result = await service.get_text('Genesis 1:2')
        data = result.get('data')
        print('keys', list(data.keys()))
        txt = data.get('text')
        he = data.get('he')
        print('text type', type(txt), 'len', len(txt) if isinstance(txt, list) else 'n/a')
        print('he type', type(he), 'len', len(he) if isinstance(he, list) else 'n/a')

asyncio.run(main())
