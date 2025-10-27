import sys
from pathlib import Path
sys.path.append(str(Path('.').resolve()))
sys.path.append(str(Path('brain_service')))
import asyncio
import httpx
from brain_service.core.settings import Settings
from brain_service.services.sefaria_service import SefariaService

async def main():
    settings = Settings()
    async with httpx.AsyncClient() as client:
        service = SefariaService(client, None, settings.SEFARIA_API_URL, settings.SEFARIA_API_KEY, cache_ttl_sec=60)
        result = await service.get_text('Genesis 1')
        data = result.get('data')
        print('keys:', list(data.keys()))
        txt = data.get('text')
        he = data.get('he')
        txt_segments = data.get('text_segments')
        he_segments = data.get('he_segments')
        print('text type:', type(txt), 'len:', len(txt) if isinstance(txt, list) else 'n/a')
        print('he type:', type(he), 'len:', len(he) if isinstance(he, list) else 'n/a')
        print('text_segments type:', type(txt_segments), 'len:', len(txt_segments) if isinstance(txt_segments, list) else 'n/a')
        print('he_segments type:', type(he_segments), 'len:', len(he_segments) if isinstance(he_segments, list) else 'n/a')
        if isinstance(txt_segments, list):
            print('first text segment:', txt_segments[0])
        if isinstance(he_segments, list):
            print('first he segment:', he_segments[0])

asyncio.run(main())
