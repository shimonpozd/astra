import logging_utils
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Response, status
from contextlib import asynccontextmanager
import asyncio
import hashlib
import json
import re
from collections import defaultdict
from typing import List, Dict, Any
import datetime

from . import models, mem0_client, cache, rate_limit, task_queue, metrics, fusion
from .qdrant_utils import ensure_collection_exists
from .config import settings
from .worker import run_worker
from .graph_db import graph_db_client
from .k_graph import k_graph_client
from .cooldown import cooldown_manager
from .backfill import run_backfill
import time

from qdrant_client import models as qmodels

# Global lock dictionary for single-flight requests
request_locks = defaultdict(asyncio.Lock)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup, create a background task for the worker
    worker_task = asyncio.create_task(run_worker())
    logger.info("Background ingest worker started.")
    
    yield # App is running
    
    # On shutdown, gracefully cancel the worker task and close DB connections
    logger.info("Shutting down...")
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        logger.info("Worker task was successfully cancelled.")
    
    await graph_db_client.close()


logger = logging_utils.get_logger("memory.main", service="memory")

app = FastAPI(title="Astra LTM Service", lifespan=lifespan)

def _get_cache_key(req: models.RecallRequest) -> str:
    """Creates a stable SHA256 hash for the request."""
    payload = {"user_id": req.user_id, "query": req.query, "k": req.k}
    payload_str = json.dumps(payload, sort_keys=True)
    return f"recall:{hashlib.sha256(payload_str.encode('utf-8')).hexdigest()}"


@app.post("/ltm/recall", response_model=models.RecallResponse)
async def recall(req: models.RecallRequest, background_tasks: BackgroundTasks):
    ensure_collection_exists(req.collection)
    # 1. Rate Limiting & Cooldown
    is_allowed, retry_after = await rate_limit.rate_limiter.is_allowed(req.user_id, req.session_id)
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Try again in {retry_after} seconds.")

    # 2. Cache Key & Single-flight Lock
    # Note: Cache key does not include collection, as it's assumed to be part of the user/query context
    cache_key = _get_cache_key(req)
    lock = request_locks[cache_key]

    async with lock:
        # 3. Cache Lookup (inside the lock)
        if settings.recall_cache_enabled:
            cached_result = await cache.recall_cache.get(cache_key)
            if cached_result:
                metrics.record_cache_hit()
                logger.info(f"[CACHE HIT] for query: {req.query}")
                return models.RecallResponse(memories=cached_result, cached=True)
        
        metrics.record_cache_miss()
        logger.info(f"[CACHE MISS] for query: {req.query}")

        # 4. Recall from Mem0
        start_time = time.time()
        try:
            memories = await mem0_client.m_client.recall(
                query=req.query, 
                k=req.k, 
                user_id=req.user_id, 
                collection=req.collection
            )
        except asyncio.TimeoutError:
            metrics.record_error("timeout")
            logger.error("Mem0 recall timed out after all retries.")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="LTM service timed out.")
        except Exception as e:
            metrics.record_error("recall_failed")
            logger.error(f"Mem0 recall failed: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to recall memories from LTM.")
        finally:
            duration = time.time() - start_time
            metrics.record_recall_latency(duration)
            logger.info(f"Recall processed in {duration:.4f} seconds.")

        # 5. Cache the result in the background
        if settings.recall_cache_enabled:
            background_tasks.add_task(cache.recall_cache.set, cache_key, memories, ttl=settings.recall_cache_ttl_seconds)

        return models.RecallResponse(memories=memories, cached=False)

@app.post("/ltm/store", response_model=models.StoreResponse)
async def store(req: models.StoreRequest):
    ensure_collection_exists(req.collection)
    try:
        queued_count = await task_queue.ingest_queue.enqueue_batch(req.items, collection=req.collection)
        return models.StoreResponse(status="queued", queued_items=queued_count)
    except Exception as e:
        logger.error(f"Failed to enqueue items for storage: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue items for storage.")


@app.post("/research/recall", response_model=models.ResearchRecallResponse)
async def research_recall(req: models.ResearchRecallRequest):
    ensure_collection_exists(req.collection)

    must_conditions = [
        qmodels.FieldCondition(key="collection", match=qmodels.MatchValue(value=req.collection)),
        qmodels.FieldCondition(key="session_id", match=qmodels.MatchValue(value=req.session_id)),
    ]
    qdrant_filter = qmodels.Filter(
        must=must_conditions
    )

    # If a semantic query is present, don't also filter by ref/origin_ref.
    # The semantic query should search the whole collection for the best match.
    if not req.query:
        if req.ref:
            must_conditions.append(qmodels.FieldCondition(key="ref", match=qmodels.MatchValue(value=req.ref)))
        if req.origin_ref:
            must_conditions.append(qmodels.FieldCondition(key="origin_ref", match=qmodels.MatchValue(value=req.origin_ref)))
    limit = min(req.limit, 40)

    try:
        hits = []
        # If no query is provided, but a ref is, use the ref itself for semantic search.
        if not req.query and req.ref:
            req.query = req.ref

        if req.query:
            query_vector = await k_graph_client._get_embedding(req.query)
            hits = await asyncio.to_thread(
                k_graph_client.qdrant_cli.search,
                collection_name=req.collection,
                query_vector=query_vector,
                query_filter=qdrant_filter,
                limit=limit,
                with_payload=True,
            )
        else:
            hits, _ = await asyncio.to_thread(
                k_graph_client.qdrant_cli.scroll,
                collection_name=req.collection,
                scroll_filter=qdrant_filter,
                with_payload=True,
                limit=limit,
            )

        chunks: List[models.ResearchChunk] = []
        groups: Dict[str, Dict[str, Any]] = {}

        for hit in hits:
            payload = getattr(hit, "payload", None) or {}
            text_val = payload.get("text", "")
            score = getattr(hit, "score", None)

            metadata = dict(payload)
            metadata.setdefault("collection", req.collection)
            metadata.pop("text", None)

            chunks.append(models.ResearchChunk(text=text_val, metadata=metadata, score=score))

            group_key = "|".join(
                str(part)
                for part in (
                    metadata.get("origin_ref") or metadata.get("ref") or "",
                    metadata.get("commentator") or "",
                    metadata.get("source") or "",
                )
            )
            group = groups.setdefault(
                group_key,
                {
                    "origin_ref": metadata.get("origin_ref"),
                    "ref": metadata.get("ref"),
                    "commentator": metadata.get("commentator"),
                    "category": metadata.get("category"),
                    "role": metadata.get("role"),
                    "source": metadata.get("source"),
                    "chunks": [],
                },
            )
            group["chunks"].append(
                {
                    "text": text_val,
                    "chunk_index": metadata.get("chunk_index"),
                    "score": score,
                }
            )

        grouped = [models.ResearchGroup(**group) for group in groups.values()]

        return models.ResearchRecallResponse(
            collection=req.collection,
            query=req.query,
            chunks=chunks,
            groups=grouped,
        )
    except Exception as e:
        metrics.record_error("research_recall_failed")
        logger.error(f"Research recall failed: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to recall research memory.")

@app.post("/graph/backfill")
async def backfill_data(background_tasks: BackgroundTasks):
    logger.info("Received request to start backfill process.")
    background_tasks.add_task(run_backfill)
    return {"status": "ok", "message": "Backfill process started in the background."}

# @app.post("/graph/recalculate_intents")
# async def recalculate_intents(background_tasks: BackgroundTasks):
#     logger.info("Received request to start intent graph recalculation.")
#     background_tasks.add_task(run_intent_recalculation)
#     return {"status": "ok", "message": "Intent graph recalculation started in the background."}

@app.post("/graph/dialog/update", response_model=models.DialogUpdateResponse)
async def dialog_update(req: models.DialogUpdateRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(graph_db_client.update_dialog, req)
        background_tasks.add_task(cooldown_manager.increment_turn_count, req.session_id)
        return models.DialogUpdateResponse(ok=True)
    except Exception as e:
        logger.error(f"Failed to enqueue dialog update: {e}")
        return models.DialogUpdateResponse(ok=False)

@app.get("/graph/context", response_model=models.ContextResponse)
async def get_graph_context(session_id: str, query: str, collection: str):
    start_time = time.time()
    try:
        # 1. Get recent context from Dialog Graph (Neo4j)
        top_topics, recent_utterances = await graph_db_client.get_context(
            session_id,
            horizon_utterances=settings.context_horizon_utterances,
            horizon_minutes=settings.context_horizon_minutes,
            tau_sec=settings.context_decay_tau_sec
        )
        active_topics = [t['topic_slug'] for t in top_topics]
        logger.info(f"Topics extracted for context search: {active_topics}")
        
        # Simple entity extraction from recent utterances for context bonus
        active_entities = []
        for utt in recent_utterances:
            # This is a placeholder for real entity extraction
            active_entities.extend(utt['text'].lower().split()) 

        # 2. Prepare and execute all search tasks in parallel with new limits
        tasks = []
        task_names = []

        # Task: Topic-based search in Qdrant
        if active_topics:
            tasks.append(asyncio.create_task(k_graph_client.search(topics=active_topics, limit=3, collection=collection))) # Limit 3
            task_names.append("qdrant_topic")

        # Task: Topic-based search in Neo4j
        if active_topics:
            tasks.append(asyncio.create_task(graph_db_client.get_facts_by_topics(topics=active_topics, limit=2))) # Limit 2
            task_names.append("neo4j_topic")
        
        # Use the user's query for semantic and keyword search
        if query:
            tasks.append(asyncio.create_task(k_graph_client.search(query_text=query, limit=4, collection=collection))) # Limit 4
            task_names.append("qdrant_semantic")

            cleaned_text = re.sub(r'[^a-zа-я0-9\s]', '', query.lower()).strip()
            all_words = cleaned_text.split()
            stop_words = {'а', 'в', 'и', 'на', 'с', 'что', 'как', 'это', 'не', 'но', 'кто', 'такой', 'бы', 'же'}
            keywords = [word for word in all_words if word not in stop_words and len(word) > 2]
            
            if keywords:
                keyword_query = " ".join(keywords)
                # Using a higher limit for keyword search as it's less precise
                tasks.append(asyncio.create_task(k_graph_client.search(keywords=keyword_query, limit=7, collection=collection)))
                task_names.append("qdrant_keyword")

        # 3. Execute tasks and fuse results
        if not tasks:
            top_facts = []
        else:
            search_results = await asyncio.gather(*tasks)
            candidate_sets = {name: result for name, result in zip(task_names, search_results)}

            logger.info("--- Search Branch Results ---")
            for source, facts in candidate_sets.items():
                logger.info(f"Source: {source}, Found: {len(facts)} facts")
                for i, fact in enumerate(facts[:3]):
                    logger.info(f"  - Result {i+1}: {fact.get('text')} (Score: {fact.get('confidence')})")
            logger.info("-----------------------------")

            user_speaker_name = "Шимон"
            # Call new fusion function with all context
            top_facts = fusion.fuse_and_rerank(
                candidate_sets=candidate_sets, 
                user_speaker_name=user_speaker_name,
                query=query,
                recent_topics=active_topics,
                recent_entities=active_entities
            )

        # 4. Format context strings
        quotes_str = "[Recent Conversation History]\n" + "\n".join(f"- {q['speaker']}: {q['text']}" for q in recent_utterances) if recent_utterances else ""
        
        knowledge_str = ""
        if top_facts:
            knowledge_items = []
            for f in top_facts:
                ts = f.get('timestamp')
                if isinstance(ts, str):
                    ts_str = ts.split('T')[0]
                elif isinstance(ts, int):
                    ts_str = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                else:
                    ts_str = ''
                # Use the new final_score from the fusion process
                confidence_str = f"{f.get('final_score', 0):.2f}" 
                knowledge_items.append(f"- {f.get('speaker', 'Unknown')}: {f.get('text')} (score: {confidence_str}, date: {ts_str})")
            knowledge_str = "[Possibly Relevant Information from Long-Term Memory]\n" + "\n".join(knowledge_items)

        # 5. Build final context
        context_parts = [knowledge_str, quotes_str]
        final_context = "\n\n".join(p for p in context_parts if p).strip()

        if len(final_context) > settings.pointer_max_chars:
            final_context = final_context[:settings.pointer_max_chars]

        duration_ms = (time.time() - start_time) * 1000
        logger.info(f"Context built in {duration_ms:.2f}ms, length {len(final_context)} chars.")
        logger.info(f"Final Context Sent to Brain:\n{final_context}")

        return models.ContextResponse(
            text=final_context,
            topics=active_topics,
            quotes=[q['text'] for q in recent_utterances],
            facts=[f.get('text') for f in top_facts],
            approx_tokens=len(final_context) // 4
        )

    except Exception as e:
        logger.info(f"Failed to build context for session {session_id}: {e}", exc_info=True)
        return models.ContextResponse(text="", topics=[], quotes=[], facts=[], approx_tokens=0)









@app.get("/healthz")
async def health_check(response: Response):
    checks = {}
    ok = True

    try:
        redis_ok = await cache.recall_cache.client.ping()
        checks["redis_cache"] = "ok" if redis_ok else "degraded"
        if not redis_ok: ok = False
    except Exception as e:
        checks["redis_cache"] = f"degraded: {str(e)[:100]}"
        ok = False

    try:
        ltm_ok = await mem0_client.m_client.ping()
        checks["ltm_qdrant"] = "ok" if ltm_ok else "degraded"
        if not ltm_ok: ok = False
    except Exception as e:
        checks["ltm_qdrant"] = f"degraded: {str(e)[:100]}"
        ok = False
        
    try:
        neo4j_ok = await graph_db_client.ping()
        checks["graph_db_neo4j"] = "ok" if neo4j_ok else "degraded"
        if not neo4j_ok: ok = False
    except Exception as e:
        checks["graph_db_neo4j"] = f"degraded: {str(e)[:100]}"
        ok = False

    final_status = "ok" if ok else "degraded"
    response.status_code = status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": final_status, "checks": checks}

@app.get("/metrics")
def get_metrics():
    return metrics.metrics_collector.get_report()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7050)
