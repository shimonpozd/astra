import asyncio
from brain.research import prepare_deepresearch_payload
from brain.state import state

async def main():
    result = await prepare_deepresearch_payload(
        prompt="Genesis 1:1",
        user_id="demo_user",
        session_id="session_demo",
        agent_id="chevruta_deepresearch",
        collection="chevruta_deepresearch",
        memory_service_url="http://localhost:7050",
    )
    print(result)
    if state.http_client:
        await state.http_client.aclose()

asyncio.run(main())
