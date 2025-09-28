from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from contextlib import asynccontextmanager
import asyncio

import models, mem0_client, cache, rate_limit, task_queue, metrics
from config import settings
from worker import run_worker
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup, create a background task for the worker
    worker_task = asyncio.create_task(run_worker())
    logger.info("Background ingest worker started.")
    yield
    # On shutdown, you could add cleanup logic here if needed
    logger.info("Shutting down. Worker will be terminated.")


app = FastAPI(title="Astra LTM Service", lifespan=lifespan)


@app.post("/ltm/recall", response_model=models.RecallResponse)
async def recall(req: models.RecallRequest, background_tasks: BackgroundTasks):
    # 1. Rate Limiting & Cooldown
    is_allowed, retry_after = await rate_limit.rate_limiter.is_allowed(req.user_id, req.session_id)
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Try again in {retry_after} seconds.")

    # 2. Cache Lookup
    cache_key = f"recall:{req.user_id}:{hash(req.query)}"
    if settings.recall_cache_enabled:
        cached_result = await cache.recall_cache.get(cache_key)
        if cached_result:
            metrics.record_cache_hit()
            logger.info(f"[CACHE HIT] for query: {req.query}")
            return models.RecallResponse(memories=cached_result, cached=True)
    
    metrics.record_cache_miss()
    logger.info(f"[CACHE MISS] for query: {req.query}")

    # 3. Recall from Mem0
    start_time = time.time()
    try:
        memories = await mem0_client.m_client.recall(query=req.query, k=req.k, user_id=req.user_id)
    except Exception as e:
        logger.error(f"Mem0 recall failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to recall memories from LTM.")
    finally:
        duration = time.time() - start_time
        metrics.record_recall_latency(duration)
        logger.info(f"Recall processed in {duration:.4f} seconds.")

    # 4. Cache the result in the background
    if settings.recall_cache_enabled:
        background_tasks.add_task(cache.recall_cache.set, cache_key, memories, ttl=settings.recall_cache_ttl_seconds)

    return models.RecallResponse(memories=memories, cached=False)

@app.post("/ltm/store", response_model=models.StoreResponse)
async def store(req: models.StoreRequest):
    try:
        queued_count = await task_queue.ingest_queue.enqueue_batch(req.items)
        return models.StoreResponse(status="queued", queued_items=queued_count)
    except Exception as e:
        logger.error(f"Failed to enqueue items for storage: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue items for storage.")

@app.get("/healthz")
async def health_check():
    # TODO: Check connections to Redis and Qdrant
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    # Running on 0.0.0.0 allows access from the network.
    # The port is set to 7050, which was the mapped port in Docker.
    uvicorn.run(app, host="0.0.0.0", port=7050)