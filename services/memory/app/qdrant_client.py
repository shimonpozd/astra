# services/memory/app/qdrant_client.py
from qdrant_client import QdrantClient
from .config import settings

client: QdrantClient = None

def get_qdrant_client() -> QdrantClient:
    global client
    if client is None:
        client = QdrantClient(url=settings.qdrant_url)
    return client
