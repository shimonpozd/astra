import requests
import sys
import json

def send_request(prompt):
    url = "http://localhost:7030/chat/stream"
    payload = {
        "text": f"/research {prompt}",
        "user_id": "cli_user",
        "session_id": "cli_session_123",
        "agent_id": "chevruta_deepresearch"
    }
    headers = {"Content-Type": "application/json", "Accept": "application/x-ndjson"}

    try:
        print(f"Sending request to {url}...")
        with requests.post(url, json=payload, stream=True, headers=headers) as r:
            r.raise_for_status()
            print("--- Response Stream ---")
            for chunk in r.iter_lines():
                if chunk:
                    try:
                        # Each chunk is a JSON object
                        data = json.loads(chunk.decode('utf-8'))
                        print(json.dumps(data, indent=2, ensure_ascii=False))
                    except json.JSONDecodeError:
                        print(f"Received non-JSON chunk: {chunk.decode('utf-8')}")

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        send_request(sys.argv[1])
    else:
        print("Usage: python send_prompt.py \"<your prompt>\"")
