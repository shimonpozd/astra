import asyncio
from brain.sefaria_client import sefaria_get_links_async
from brain.sefaria_utils import clean_commentary_links

async def test_relaxed():
    data = await sefaria_get_links_async('Genesis 1:7')
    if data.get('ok'):
        raw_links = data['data']
        raw_count = len(raw_links)
        rashi_raw = sum(1 for d in raw_links if 'rashi' in str(d).lower())
        # Relax exact_anchor
        cleaned_relaxed = clean_commentary_links(raw_links, 'Genesis 1:7', exact_anchor=False)
        cleaned_count = len(cleaned_relaxed)
        rashi_cleaned = sum(1 for c in cleaned_relaxed if 'rashi' in c.get('commentator', '').lower())
        print(f'Raw links: {raw_count}, Rashi raw: {rashi_raw}')
        print(f'Cleaned (exact_anchor=False): {cleaned_count}, Rashi cleaned: {rashi_cleaned}')
        if rashi_cleaned > 0:
            print('DIAGNOSIS: exact_anchor was the culprit - Rashi now included with relaxed anchor')
            # Print first Rashi
            for c in cleaned_relaxed:
                if 'rashi' in c.get('commentator', '').lower():
                    print(f'First Rashi in relaxed: {c}')
                    break
        else:
            print('DIAGNOSIS: Still filtered - issue in category/type or commentator extraction')
    else:
        print(f'Error: {data.get("error")}')

if __name__ == '__main__':
    asyncio.run(test_relaxed())