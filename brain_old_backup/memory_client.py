import logging
from datetime import datetime
from typing import Iterable, Optional, Dict, Any, List

import httpx

from .state import state

logger = logging.getLogger(__name__)

async def store_chunks_in_memory(
    *,
    base_url: str,
    collection: str,
    user_id: str,
    session_id: str,
    agent_id: str,
    chunks: Iterable[Any],
    metadata: Optional[Dict[str, Any]] = None,
    chunk_metadata: Optional[List[Dict[str, Any]]] = None,
    timeout: float = 15.0,
) -> Dict[str, Any]:
    """Send prepared chunks to memory-service `/ltm/store` endpoint."""
    chunk_list = list(chunks)
    if not chunk_list:
        return {"status": "skipped", "reason": "no_chunks"}

    client = state.http_client
    if client is None:
        client = httpx.AsyncClient(proxies={})
        state.http_client = client

    ts = datetime.utcnow().isoformat() + "Z"
    items = []
    for idx, chunk in enumerate(chunk_list):
        text = getattr(chunk, "text", None) or chunk
        if not text:
            continue
        chunk_meta = dict(metadata or {})
        if chunk_metadata and idx < len(chunk_metadata):
            chunk_meta.update(chunk_metadata[idx] or {})
        chunk_meta.update({
            "agent_id": agent_id,
            "chunk_index": idx,
        })
        items.append({
            "text": text,
            "user_id": user_id,
            "session_id": session_id,
            "role": "context",
            "ts": ts,
            "metadata": chunk_meta,
        })

    if not items:
        return {"status": "skipped", "reason": "empty_text"}

    payload = {"items": items, "collection": collection}
    url = f"{base_url.rstrip('/')}/ltm/store"

    try:
        response = await client.post(url, json=payload, timeout=timeout)
        response.raise_for_status()
        logger.info("Stored %d chunks in memory collection '%s'", len(items), collection)
        return response.json()
    except httpx.HTTPError as e:
        logger.error("Failed to store chunks in memory: %s", e, exc_info=True)
        return {"status": "error", "error": str(e)}

