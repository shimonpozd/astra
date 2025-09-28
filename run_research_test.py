import asyncio
from brain.research import prepare_deepresearch_payload
from brain.sefaria_index import load_toc
from brain.state import state

async def main():
    try:
        await load_toc()
    except Exception as e:
        print("load_toc error", e)
    result = await prepare_deepresearch_payload(
        prompt="Genesis 1:1",
        user_id="demo_user",
        session_id="session_demo",
        agent_id="chevruta_deepresearch",
        collection_base="chevruta_deepresearch",
        memory_service_url="http://localhost:7050",
        per_study_collection=True,
    )
    print(result.get("collection"), result.get("memory_status"))
    if state.http_client:
        await state.http_client.aclose()

asyncio.run(main())
