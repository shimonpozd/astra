import asyncio
from brain.sefaria_client import sefaria_get_links_async
from brain.sefaria_utils import clean_commentary_links

async def test_genesis_17():
    data = await sefaria_get_links_async('Genesis 1:7')
    raw_count = len(data['data']) if data.get('ok') else 0
    rashi_raw = sum(1 for d in data['data'] if 'rashi' in str(d).lower()) if data.get('ok') else 0
    cleaned = clean_commentary_links(data['data'], 'Genesis 1:7') if data.get('ok') else []
    cleaned_count = len(cleaned)
    rashi_cleaned = sum(1 for c in cleaned if 'rashi' in c.get('commentator', '').lower())
    print(f'Raw links: {raw_count}, Rashi raw: {rashi_raw}')
    print(f'Cleaned links: {cleaned_count}, Rashi cleaned: {rashi_cleaned}')
    if rashi_raw > 0 and rashi_cleaned == 0:
        print('DIAGNOSIS: Rashi filtered out by clean_commentary_links()')
    elif rashi_raw == 0:
        print('DIAGNOSIS: Rashi not in raw /api/links response')
    else:
        print('DIAGNOSIS: Rashi present in both raw and cleaned')

asyncio.run(test_genesis_17())