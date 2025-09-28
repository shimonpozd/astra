import logging
import time
import asyncio
import requests
try:
    import ollama
except ImportError:
    ollama = None
from qdrant_client import QdrantClient, models
from openai import OpenAI
from typing import List, Optional, Dict, Any

from .config import settings
from . import metrics

logger = logging.getLogger(__name__)

class KGraphQdrant:
    def __init__(self):
        self.qdrant_cli = QdrantClient(url=settings.qdrant_url)
        self.collection_name = settings.KGRAPH_QDRANT_COLLECTION
        
        self.embed_mode = settings.embedding_model_provider
        self.embedding_model_name = settings.embedding_model_name

        print(f"[DEBUG] embed_mode from settings: '{settings.embedding_model_provider}'")
        print(f"[DEBUG] embedding_model_name: '{settings.embedding_model_name}'")
        self.embed_mode = settings.embedding_model_provider

        local_model_markers = (":", ".gguf", "/")
        if self.embed_mode == "openai" and any(m in self.embedding_model_name for m in local_model_markers):
            raise RuntimeError(
                f"Inconsistent embedding config: provider=openai, but model='{self.embedding_model_name}' "
                f"выглядит как локальная (Ollama). Проверьте EMBEDDING_MODEL_PROVIDER/NAME."
            )
        
        if self.embed_mode == 'ollama':
            self.openai_cli = OpenAI(
                base_url=f"{settings.ollama_api_url}/v1",
                api_key='ollama'
            )
            logger.info(f"[KGraph] Embeddings via OLLAMA base_url={settings.ollama_api_url}/v1 model={self.embedding_model_name}")
        elif self.embed_mode == 'openai':
            self.openai_cli = OpenAI(api_key=settings.openai_api_key)
            logger.info(f"[KGraph] Embeddings via OPENAI base_url=api.openai.com/v1 model={self.embedding_model_name}")
        else:
            raise RuntimeError(f"Unsupported embedding provider: {self.embed_mode}")

        logger.info(f"K-Graph initialized. Collection: {self.collection_name}, Embed Mode: {self.embed_mode}")

    async def _get_embedding(self, text: str) -> List[float]:
        """Creates an embedding for a given text using the configured provider."""
        try:
            res = await asyncio.to_thread(
                self.openai_cli.embeddings.create, 
                input=[text], 
                model=self.embedding_model_name
            )
            return res.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to get embedding for provider {self.embed_mode}: {e}", exc_info=True)
            raise

    def _build_qdrant_filter(
        self,
        participants: Optional[List[str]] = None,
        speaker: Optional[str] = None,
        topics: Optional[List[str]] = None,
        entities: Optional[List[str]] = None,
        session_id: Optional[str] = None,
        date_from: Optional[int] = None,
        date_to: Optional[int] = None,
        include_default_participants: bool = True,
        should_topics: Optional[List[str]] = None,
        must_not_entities: Optional[List[str]] = None
    ) -> models.Filter:
        """Builds a Qdrant filter based on the provided criteria."""
        must = []
        should = []
        must_not = []

        if include_default_participants and settings.KGRAPH_DEFAULT_PARTICIPANTS:
            must.append(models.FieldCondition(key="participants", match=models.MatchAny(any=settings.KGRAPH_DEFAULT_PARTICIPANTS)))

        if participants:
            must.append(models.FieldCondition(key="participants", match=models.MatchAny(any=participants)))
        if speaker:
            must.append(models.FieldCondition(key="speaker", match=models.MatchValue(value=speaker)))
        if topics:
            must.append(models.FieldCondition(key="topic_slugs", match=models.MatchAny(any=topics)))
        if should_topics:
            should.append(models.FieldCondition(key="topic_slugs", match=models.MatchAny(any=should_topics)))
        if entities:
            must.append(models.FieldCondition(key="entity_slugs", match=models.MatchAny(any=entities)))
        if must_not_entities:
            must_not.append(models.FieldCondition(key="entity_slugs", match=models.MatchAny(any=must_not_entities)))
        
        if date_from or date_to:
            must.append(models.FieldCondition(key="date_int", range=models.Range(gte=date_from, lte=date_to)))

        return models.Filter(must=must, should=should, must_not=must_not)

    async def search(
        self,
        query_text: Optional[str] = None,
        keywords: Optional[str] = None,
        limit: int = 10,
        collection: Optional[str] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """
        Performs a search in Qdrant.
        - If query_text is provided, it's a semantic vector search.
        - If keywords are provided, it's a full-text search (using scroll).
        - Filters from kwargs are applied in all cases.
        """
        start_time = time.time()
        try:
            collection_to_use = collection or self.collection_name
            qdrant_filter = self._build_qdrant_filter(**kwargs)

            if query_text:
                search_args = {
                    "collection_name": collection_to_use,
                    "limit": limit,
                    "with_payload": True,
                    "query_vector": await self._get_embedding(query_text),
                    "query_filter": qdrant_filter
                }
                search_res = await asyncio.to_thread(self.qdrant_cli.search, **search_args)
                results = [
                    {
                        "fact_id": hit.payload.get("fact_id", hit.id), # FIX
                        "text": hit.payload.get("text"),
                        "speaker": hit.payload.get("speaker"),
                        "timestamp": hit.payload.get("timestamp"),
                        "confidence": hit.score if hasattr(hit, 'score') else hit.payload.get("confidence"),
                        "source_message_ids": hit.payload.get("source_message_ids"),
                    }
                    for hit in search_res
                ]
                return results

            elif keywords:
                qdrant_filter.must.append(
                    models.FieldCondition(key="text", match=models.MatchText(text=keywords))
                )
                search_res, _ = await asyncio.to_thread(
                    self.qdrant_cli.scroll,
                    collection_name=collection_to_use,
                    scroll_filter=qdrant_filter,
                    limit=limit,
                    with_payload=True,
                )
                # Keyword matches don't have a distance score, so we assign a default confidence for the fusion logic
                return [
                    {
                        "fact_id": hit.payload.get("fact_id", hit.id), # FIX
                        "text": hit.payload.get("text"),
                        "speaker": hit.payload.get("speaker"),
                        "timestamp": hit.payload.get("timestamp"),
                        "confidence": 0.6, # Default confidence for keyword match
                        "source_message_ids": hit.payload.get("source_message_ids"),
                    }
                    for hit in search_res
                ]

            else: # Fallback to scroll if no query or keywords are provided
                search_res, _ = await asyncio.to_thread(
                    self.qdrant_cli.scroll,
                    collection_name=collection_to_use,
                    scroll_filter=qdrant_filter,
                    limit=limit,
                    with_payload=True,
                )
                return [
                    {
                        "fact_id": hit.payload.get("fact_id", hit.id), # FIX
                        "text": hit.payload.get("text"),
                        "speaker": hit.payload.get("speaker"),
                        "timestamp": hit.payload.get("timestamp"),
                        "confidence": hit.payload.get("confidence"), # No score in scroll
                        "source_message_ids": hit.payload.get("source_message_ids"),
                    }
                    for hit in search_res
                ]

        except Exception as e:
            logger.error(f"K-Graph search failed: {e}", exc_info=True)
            return []
        finally:
            metrics.record_qdrant_query((time.time() - start_time) * 1000)

# --- Global Instance ---
k_graph_client = KGraphQdrant()