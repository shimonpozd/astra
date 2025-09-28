from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Response, status
from contextlib import asynccontextmanager
import asyncio
import hashlib
import json
from collections import defaultdict

import models, mem0_client, cache, rate_limit, task_queue, metrics
from config import settings
from worker import run_worker
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global lock dictionary for single-flight requests
request_locks = defaultdict(asyncio.Lock)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup, create a background task for the worker
    worker_task = asyncio.create_task(run_worker())
    logger.info("Background ingest worker started.")
    
    yield # App is running
    
    # On shutdown, gracefully cancel the worker task
    logger.info("Shutting down. Cancelling worker task...")
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        logger.info("Worker task was successfully cancelled.")


app = FastAPI(title="Astra LTM Service", lifespan=lifespan)

def _get_cache_key(req: models.RecallRequest) -> str:
    """Creates a stable SHA256 hash for the request."""
    payload = {"user_id": req.user_id, "query": req.query, "k": req.k}
    payload_str = json.dumps(payload, sort_keys=True)
    return f"recall:{hashlib.sha256(payload_str.encode('utf-8')).hexdigest()}"


@app.post("/ltm/recall", response_model=models.RecallResponse)
async def recall(req: models.RecallRequest, background_tasks: BackgroundTasks):
    # 1. Rate Limiting & Cooldown
    is_allowed, retry_after = await rate_limit.rate_limiter.is_allowed(req.user_id, req.session_id)
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Try again in {retry_after} seconds.")

    # 2. Cache Key & Single-flight Lock
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
            memories = await mem0_client.m_client.recall(query=req.query, k=req.k, user_id=req.user_id)
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
    try:
        queued_count = await task_queue.ingest_queue.enqueue_batch(req.items)
        return models.StoreResponse(status="queued", queued_items=queued_count)
    except Exception as e:
        logger.error(f"Failed to enqueue items for storage: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue items for storage.")

@app.get("/healthz")
async def health_check(response: Response):
    checks = {}
    ok = True

    # Check Redis
    try:
        redis_ok = await cache.recall_cache.client.ping()
        checks["redis_cache"] = "ok" if redis_ok else "degraded"
        if not redis_ok: ok = False
    except Exception as e:
        checks["redis_cache"] = f"degraded: {str(e)[:100]}"
        ok = False

    # Check LTM (Mem0 -> Qdrant)
    try:
        ltm_ok = await mem0_client.m_client.ping()
        checks["ltm_qdrant"] = "ok" if ltm_ok else "degraded"
        if not ltm_ok: ok = False
    except Exception as e:
        checks["ltm_qdrant"] = f"degraded: {str(e)[:100]}"
        ok = False

    final_status = "ok" if ok else "degraded"
    response.status_code = status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": final_status, "checks": checks}

@app.get("/metrics")
def get_metrics():
    return metrics.metrics_collector.get_report()


if __name__ == "__main__":
    import uvicorn
    # Running on 0.0.0.0 allows access from the network.
    # The port is set to 7050, which was the mapped port in Docker.
    uvicorn.run(app, host="0.0.0.0", port=7050)
