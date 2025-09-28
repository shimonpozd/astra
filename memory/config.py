# memory/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import List, Optional
from pathlib import Path

def _resolve_env_file() -> str:
    # Start from script directory and search upwards
    here = Path(__file__).resolve().parent
    for p in [here, *here.parents]:
        f = p / ".env"
        if f.exists():
            return str(f)
    # Fallback: search from cwd
    cwd = Path.cwd()
    for p in [cwd, *cwd.parents]:
        f = p / ".env"
        if f.exists():
            return str(f)
    # Final fallback: next to config.py
    return str(Path(__file__).resolve().parent / ".env")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_resolve_env_file(),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    redis_url: str = "redis://localhost:6379/0"
    qdrant_url: str = "http://localhost:6333"
    openai_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openrouter_api_base: str = "https://openrouter.ai/api/v1"
    openrouter_referer: Optional[str] = None
    openrouter_app_title: Optional[str] = None

    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"

    embedding_model_provider: str = "openai"
    embedding_model_name: str = "text-embedding-3-small"
    embedding_dim: int = 0  # Placeholder, will be set by validator
    embedding_cache_ttl_seconds: int = 604800
    ollama_api_url: str = "http://localhost:11434"

    recall_cache_enabled: bool = True
    recall_cache_ttl_seconds: int = 90

    recall_cooldown_seconds: int = 10
    recall_rate_limit_per_minute: int = 12

    ingest_queue_name: str = "astra_ltm_ingest_queue"
    ingest_batch_size: int = 100
    ingest_batch_timeout_ms: int = 500

    memory_mask_pii: bool = True

    # Neo4j Graph DB settings
    neo4j_url: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password123"

    # Graph Context settings
    context_horizon_utterances: int = 20
    context_horizon_minutes: int = 60
    context_decay_tau_sec: int = 1800
    pointer_max_chars: int = 1000

    # Proactive Cooldown settings
    proactive_cooldown_turns: int = 1 # Suggest every other turn

    # K-Graph settings
    KGRAPH_QDRANT_COLLECTION: str = "my_new_embedding_collection"
    KGRAPH_ALLOW_SCROLL_FALLBACK: bool = False
    KGRAPH_DEFAULT_PARTICIPANTS: Optional[List[str]] = ["Шимон", "Казах"]
    KGRAPH_FORCE_SESSION: bool = False
    KGRAPH_SESSION_ID: Optional[str] = None
    KGRAPH_TIME_HORIZON_DAYS: Optional[int] = None
    mem0_collection_name: str = "astra_memory"

    # Fusion & Recall Settings
    recall_limit: int = 10
    fusion_rrf_k: int = 60 # k parameter for Reciprocal Rank Fusion
    recency_decay_tau_sec: int = 10_000_000 # Tau for recency decay, in seconds (e.g., 1 day)
    fusion_speaker_boost: float = 1.1 # Boost for user's own memories

    # Weights for optional linear fusion (RRF is default)
    fusion_weight_dense: float = 0.5
    fusion_weight_keyword: float = 0.2
    fusion_weight_neo4j_topic: float = 0.15
    fusion_weight_neo4j_fts: float = 0.1
    fusion_weight_neo4j_knn: float = 0.05

    # Intent Graph Recalculation
    intent_recalc_last_k_sessions: int = 1000

    @field_validator("llm_provider", "embedding_model_provider", mode="before")
    def _normalize_provider(cls, value: str) -> str:
        if isinstance(value, str):
            return value.lower()
        return value

    @model_validator(mode='after')
    def set_embedding_dim(self) -> 'Settings':
        if "gemma" in self.embedding_model_name:
            self.embedding_dim = 768
        elif "text-embedding-3-small" in self.embedding_model_name:
            self.embedding_dim = 1536
        else:
            # Default or error
            self.embedding_dim = 1536 # or raise an error
        return self

settings = Settings()

# Диагностика при импорте
print(f"[CONFIG] env_file = {Settings.model_config.get('env_file')}")
print(f"[CONFIG] llm_provider={settings.llm_provider} llm_model={settings.llm_model}")
print(f"[CONFIG] embedding_provider={settings.embedding_model_provider} embedding_model={settings.embedding_model_name}")
print(f"[CONFIG] ollama_api_url={settings.ollama_api_url}")
print(f"[CONFIG] embedding_dim={settings.embedding_dim}")