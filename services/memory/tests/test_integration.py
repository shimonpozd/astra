import requests
import time
import uuid

MEMORY_SERVICE_URL = "http://localhost:7050"

def test_store_and_recall():
    user_id = f"test-user-{uuid.uuid4()}"
    session_id = f"test-session-{uuid.uuid4()}"
    test_memory = f"test memory {uuid.uuid4()}"

    # Store a memory
    store_payload = {
        "items": [
            {
                "text": test_memory,
                "user_id": user_id,
                "session_id": session_id,
                "role": "user",
                "ts": time.time()
            }
        ]
    }
    store_response = requests.post(f"{MEMORY_SERVICE_URL}/ltm/store", json=store_payload)
    assert store_response.status_code == 200
    assert store_response.json()["queued_items"] == 1

    # Wait for the worker to process the item
    time.sleep(2)

    # Recall the memory
    recall_payload = {
        "user_id": user_id,
        "session_id": session_id,
        "query": test_memory
    }
    recall_response = requests.post(f"{MEMORY_SERVICE_URL}/ltm/recall", json=recall_payload)
    assert recall_response.status_code == 200
    recalled_data = recall_response.json()
    assert not recalled_data["cached"]
    assert len(recalled_data["memories"]) > 0

    # Check if the recalled memory is the one we stored
    found = False
    for mem in recalled_data["memories"]:
        if test_memory in mem.get("text", ""):
            found = True
            break
    assert found, f"Did not find '{test_memory}' in recalled memories"
