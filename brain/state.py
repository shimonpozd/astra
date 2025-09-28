import hashlib
from typing import Optional, Dict, Any, List, Tuple, Union
import redis.asyncio as redis
import httpx
from openai import OpenAI
from pydantic import BaseModel
from datetime import datetime
from dataclasses import dataclass, field, asdict

# --- STATE MANAGEMENT ---
class Message(BaseModel):
    role: str
    content: Union[str, Dict[str, Any], None] = None
    content_type: str = "text.v1"
    tool_calls: Optional[List[Dict]] = None

@dataclass
class StudyState:
    current_ref: str | None = None
    mode: str = "girsa"                # "girsa" | "iyun"
    selected_commentator: str | None = None
    commentator_refs: list[str] = field(default_factory=list)  # упорядоченный список ссылок автора
    commentator_pos: int = 0           # 0-based

class Session:
    def __init__(self, user_id: str, agent_id: str, persistent_session_id: Optional[str] = None):
        self.user_id = user_id
        self.agent_id = agent_id
        if persistent_session_id:
            self.persistent_session_id = persistent_session_id
        else:
            self.persistent_session_id = hashlib.sha256(f"{user_id}:{agent_id}".encode()).hexdigest()
        self.short_term_memory: List[Message] = []
        self.study_state = StudyState()
        self.seen_refs: Set[str] = set() # Tracks refs processed in this research flow
        self.sefaria_cache: Dict[str, Any] = {} # Cache for links_compact, authors_grouped, etc. by ref
        self.last_research_collection: Optional[str] = None
        self.conversational_collection: Optional[str] = None
        self.name: Optional[str] = None # For chat naming
        self.last_modified: Optional[str] = None

    def add_message(self, role: str, content: Union[str, Dict[str, Any], None] = None, content_type: str = "text.v1", tool_calls: Optional[List[Dict]] = None):
        self.short_term_memory.append(Message(role=role, content=content, content_type=content_type, tool_calls=tool_calls))
        if len(self.short_term_memory) > 24: # STM_BUFFER_SIZE
            self.short_term_memory.pop(0)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the session object to a dictionary."""
        return {
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "persistent_session_id": self.persistent_session_id,
            "short_term_memory": [msg.model_dump() for msg in self.short_term_memory],
            "study_state": asdict(self.study_state) if self.study_state else None,
            "seen_refs": list(self.seen_refs), # Convert set to list for JSON
            "sefaria_cache": self.sefaria_cache,
            "last_research_collection": self.last_research_collection,
            "conversational_collection": self.conversational_collection,
            "name": self.name,
            "last_modified": self.last_modified,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Session":
        """Deserializes a dictionary into a session object."""
        session = cls(
            user_id=data["user_id"],
            agent_id=data["agent_id"],
            persistent_session_id=data["persistent_session_id"]
        )
        session.short_term_memory = [Message.model_validate(msg_data) for msg_data in data.get("short_term_memory", [])]
        
        study_state_data = data.get("study_state")
        if study_state_data:
            session.study_state = StudyState(**study_state_data)
            
        session.seen_refs = set(data.get("seen_refs", [])) # Convert list back to set
        session.sefaria_cache = data.get("sefaria_cache", {})
        session.last_research_collection = data.get("last_research_collection")
        session.conversational_collection = data.get("conversational_collection")
        session.name = data.get("name")
        session.last_modified = data.get("last_modified")
        return session

class GlobalState:
    openai_client: Optional[OpenAI] = None
    redis_client: Optional[redis.Redis] = None
    http_client: Optional[httpx.AsyncClient] = None
    personalities: Dict[str, Any] = {}
    sessions: Dict[Tuple[str, str], Session] = {}
    ltm_error_count = 0
    ltm_circuit_open_until: Optional[datetime] = None
    known_intents: List[str] = []
    sefaria_index_data: Dict[str, Any] = {}
    sefaria_enriched_books: set = set()

state = GlobalState()
