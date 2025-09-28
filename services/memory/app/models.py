# services/memory/app/models.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class RecallRequest(BaseModel):
    user_id: str
    session_id: str
    query: str
    k: int = 5
    filters: Optional[Dict[str, Any]] = None

class RecallResponse(BaseModel):
    memories: List[Dict[str, Any]]
    cached: bool

class MemoryItem(BaseModel):
    text: str
    user_id: str
    session_id: str
    role: str
    ts: str
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

class StoreRequest(BaseModel):
    items: List[MemoryItem]

class StoreResponse(BaseModel):
    status: str
    queued_items: int
