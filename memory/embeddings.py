# services/memory/app/embeddings.py
# Placeholder for embedding logic

class EmbeddingProvider:
    def get_embedding(self, text: str):
        print(f"Getting embedding for: {text[:30]}...")
        # Mock embedding
        return [0.1] * 1536

embed_provider = EmbeddingProvider()
