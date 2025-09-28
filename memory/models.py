# services/memory/app/models.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class RecallRequest(BaseModel):
    user_id: str
    session_id: str
    query: str = Field(..., max_length=1024)
    k: int = Field(5, ge=1, le=8)
    filters: Optional[Dict[str, Any]] = None
    collection: str

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
    collection: str

class StoreResponse(BaseModel):
    status: str
    queued_items: int


class ResearchRecallRequest(BaseModel):
    user_id: str
    session_id: str
    collection: str
    query: Optional[str] = Field(default=None, max_length=1024)
    ref: Optional[str] = None
    origin_ref: Optional[str] = None
    limit: int = Field(20, ge=1, le=40)


class ResearchChunk(BaseModel):
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    score: Optional[float] = None


class ResearchGroup(BaseModel):
    origin_ref: Optional[str]
    ref: Optional[str]
    commentator: Optional[str]
    category: Optional[str]
    role: Optional[str]
    source: Optional[str]
    chunks: List[Dict[str, Any]] = Field(default_factory=list)


class ResearchRecallResponse(BaseModel):
    collection: str
    query: Optional[str]
    chunks: List[ResearchChunk]
    groups: List[ResearchGroup] = Field(default_factory=list)

# --- Graph Models ---

class DialogUpdateRequest(BaseModel):
    session_id: str
    speaker: str # 'user' or 'assistant'
    ts: str # ISO 8601 timestamp
    text: str
    topics: List[str] = Field(default_factory=list)

class DialogUpdateResponse(BaseModel):
    ok: bool

class ContextResponse(BaseModel):
    text: str
    topics: List[str]
    quotes: List[str]
    facts: List[str]
    approx_tokens: int

class NextStepsResponse(BaseModel):
    proactive_allowed: bool
    candidates: List[str]
    cooldown: bool
