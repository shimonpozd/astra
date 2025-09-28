import requests
text = "בראשית ברא אלוהים את השמים ואת הארץ"
for model in ["embeddinggemma:latest", "embeddinggemma:300m", "nomic-embed-text", "snowflake-arctic-embed-m"]:
    resp = requests.post("http://localhost:11434/api/embeddings", json={"model": model, "input": text}, timeout=10)
    print(model, resp.status_code, len(resp.json().get("embedding", [])))
