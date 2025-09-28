import asyncio
import logging
from mem0 import Memory
from .config import settings
from .models import MemoryItem
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class Mem0Client:
    def __init__(self):
        # Create a configuration dictionary for mem0 from our settings
        config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "url": settings.qdrant_url,
                    "collection_name": settings.mem0_collection_name
                }
            },
            "embedder": self._build_embedder_config(),
            "llm": self._build_llm_config(),
        }
        # Initialize mem0 from the config
        self.mem0 = Memory.from_config(config)

    def _build_embedder_config(self) -> Dict[str, Any]:
        provider = (settings.embedding_model_provider or "").lower()
        model = settings.embedding_model_name
        if provider == "openai":
            if not settings.openai_api_key:
                raise ValueError("OPENAI_API_KEY is required when EMBEDDING_MODEL_PROVIDER is 'openai'")
            return {
                "provider": "openai",
                "config": {
                    "model": model,
                    "api_key": settings.openai_api_key,
                },
            }
        if provider == "ollama":
            return {
                "provider": "ollama",
                "config": {
                    "model": model,
                    "ollama_base_url": settings.ollama_api_url,
                },
            }
        raise ValueError(f"Unsupported embedding provider: {provider}")

    def _build_llm_config(self) -> Dict[str, Any]:
        provider = (settings.llm_provider or "").lower()
        model = settings.llm_model

        if provider == "openai":
            if not settings.openai_api_key:
                raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER is 'openai'")
            return {
                "provider": "openai",
                "config": {
                    "model": model,
                    "api_key": settings.openai_api_key,
                },
            }

        if provider == "openrouter":
            logger.info("LLM_PROVIDER is 'openrouter', but mem0 does not support it. Forcing 'ollama' for mem0.")
            if not settings.ollama_api_url:
                raise ValueError("OLLAMA_API_URL is required when forcing ollama for mem0")
            return {
                "provider": "ollama",
                "config": {
                    "model": model,
                    "ollama_base_url": settings.ollama_api_url,
                },
            }

        if provider == "ollama":
            return {
                "provider": "ollama",
                "config": {
                    "model": model,
                    "ollama_base_url": settings.ollama_api_url,
                },
            }

        raise ValueError(f"Unsupported LLM provider: {provider}")

    async def recall(self, query: str, k: int, user_id: str, collection: str) -> List[Dict[str, Any]]:
        """Performs a search for memories with timeout and retry logic."""
        limit = max(k * 2, k)
        for attempt in range(2):  # Try up to 2 times
            try:
                # Run the synchronous search call in a thread to avoid blocking
                search_task = asyncio.to_thread(
                    self.mem0.search, query=query, user_id=user_id, limit=limit
                )
                # Wait for the result with a 6-second timeout
                search_result = await asyncio.wait_for(search_task, timeout=6.0)
                results = search_result.get("results", [])
                if collection:
                    results = [r for r in results if r.get("metadata", {}).get("collection") == collection]
                logger.info(
                    "Mem0 recall query: '%s', k: %s, user_id: %s, collection: %s, hits: %s",
                    query,
                    k,
                    user_id,
                    collection,
                    len(results),
                )
                return results[:k]
            except asyncio.TimeoutError:
                logger.warning(f"Mem0 search timed out on attempt {attempt + 1}")
                if attempt == 1:  # If it's the last attempt
                    raise  # Re-raise the timeout error to be caught by the main endpoint
            except Exception as e:
                message = str(e)
                if "429" in message or "insufficient_quota" in message:
                    logger.warning("Mem0 recall skipped due to embedding provider quota: %s", message)
                    return []
                logger.error(f"An unexpected error occurred during mem0 search: {e}")
                raise  # Re-raise other exceptions immediately
        return []  # Fallback

    async def store_batch(self, items: List[MemoryItem], collection: str):
        """Stores a batch of memory items by iterating and adding them one by one."""
        def _sync_store_batch():
            for item in items:
                metadata = dict(item.metadata or {})
                if collection:
                    metadata.setdefault("collection", collection)
                self.mem0.add(item.text, user_id=item.user_id, metadata=metadata)

        try:
            await asyncio.to_thread(_sync_store_batch)
        except Exception as e:
            logger.error(f"Failed to store batch in mem0 for collection {collection}: {e}")

    async def ping(self) -> bool:
        """Checks if the underlying vector store (Qdrant) is reachable.""" 
        try:
            # The mem0 library doesn't expose the qdrant client directly.
            # A dummy search is a reliable way to check the connection.
            await self.recall(query="healthcheck", k=1, user_id="_system", collection=settings.mem0_collection_name)
            return True
        except Exception:
            return False

m_client = Mem0Client()
