from mem0 import Memory
from .config import settings
from .models import MemoryItem
from typing import List, Dict, Any

class Mem0Client:
    def __init__(self):
        # Initialize mem0 with Qdrant backend and OpenAI embeddings
        # Note: The mem0 library might have its own way of configuring providers.
        # This is based on the available documentation.
        self.mem0 = Memory(
            # The library internally uses OpenAI by default if the API key is set.
            # Configuration for different LLMs and vector stores would go here.
        )

    async def recall(self, query: str, k: int, user_id: str) -> List[Dict[str, Any]]:
        """Performs a search for memories."""
        return self.mem0.search(query=query, user_id=user_id, limit=k)

    async def store_batch(self, items: List[MemoryItem]):
        """Stores a batch of memory items."""
        for item in items:
            self.mem0.add(item.text, user_id=item.user_id, metadata=item.metadata)
        return

m_client = Mem0Client()
