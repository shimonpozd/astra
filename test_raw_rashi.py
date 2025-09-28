import asyncio
from brain.sefaria_client import sefaria_get_links_async

async def test_raw_rashi():
    data = await sefaria_get_links_async('Genesis 1:7')
    if data.get('ok'):
        raw_links = data['data']
        raw_count = len(raw_links)
        rashi_count = sum(1 for link in raw_links if 'rashi' in str(link).lower())
        print(f'Raw links total: {raw_count}')
        print(f'Rashi mentions in raw: {rashi_count}')
        if rashi_count > 0:
            print('Rashi found in raw data')
            # Print first Rashi link for inspection
            for i, link in enumerate(raw_links):
                if 'rashi' in str(link).lower():
                    print(f'First Rashi link: {link}')
                    break
        else:
            print('No Rashi in raw data')
    else:
        print(f'Error fetching links: {data.get("error", "Unknown error")}')

if __name__ == '__main__':
    asyncio.run(test_raw_rashi())