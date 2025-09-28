import asyncio
from brain.research import prepare_deepresearch_payload
from brain.sefaria_index import load_toc
from brain.state import state

async def main():
    await load_toc()
    result = await prepare_deepresearch_payload(
        prompt="Берешит 1:8",
        user_id="test_user",
        session_id="session_test",
        agent_id="chevruta_deepresearch",
        collection="chevruta_deepresearch",
        memory_service_url="http://localhost:7050",
    )
    print(result)
    if state.http_client:
        await state.http_client.aclose()

asyncio.run(main())
