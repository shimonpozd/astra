import requests
import json

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen2:7b" # Or the model you are using

def test_ollama():
    """
    Sends a simple test request to the Ollama server.
    """
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant that outputs in JSON."
            },
            {
                "role": "user",
                "content": "Who is the most famous cat in the world? Please provide the answer in a JSON object with a 'cat_name' key."
            }
        ],
        "format": "json",
        "stream": False
    }

    try:
        print(f"Sending request to {OLLAMA_URL} with model {MODEL_NAME}...")
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()  # Raise an exception for bad status codes

        print("\n--- Raw Response ---")
        print(response.text)
        print("--------------------\n")

        try:
            response_json = response.json()
            if "message" in response_json and "content" in response_json["message"]:
                print("Successfully received and parsed response from Ollama.")
                print("Model response content:")
                print(response_json["message"]["content"])
            else:
                print("Ollama responded, but the response format is unexpected.")

        except json.JSONDecodeError:
            print("Failed to parse JSON response from Ollama.")

    except requests.exceptions.RequestException as e:
        print(f"An error occurred while connecting to the Ollama server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    test_ollama()
