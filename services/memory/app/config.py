# services/memory/app/config.py
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

USE_ASTRA_CONFIG = os.getenv("ASTRA_CONFIG_ENABLED", "false").lower() in {"1", "true", "yes"}

if USE_ASTRA_CONFIG:
    try:
        from config import get_config_section
    except Exception as exc:  # pragma: no cover - fail back to legacy mode
        USE_ASTRA_CONFIG = False
        print(f"[CONFIG] falling back to legacy env loading (error importing config loader: {exc})")


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
        extra="ignore",
    )

    redis_url: str = "redis://localhost:6379/0"
    qdrant_url: str = "http://localhost:6333"
    openai_api_key: str | None = None

    ollama_api_url: str = "http://localhost:11434"

    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"

    embedding_model_provider: str = "openai"
    embedding_model_name: str = "text-embedding-3-small"
    embedding_cache_ttl_seconds: int = 604800

    recall_cache_enabled: bool = True
    recall_cache_ttl_seconds: int = 90

    recall_cooldown_seconds: int = 10
    recall_rate_limit_per_minute: int = 12

    ingest_queue_name: str = "astra_ltm_ingest_queue"
    ingest_batch_size: int = 100
    ingest_batch_timeout_ms: int = 500

    memory_mask_pii: bool = True

    @field_validator("llm_provider", "embedding_model_provider", mode="before")
    def _normalize_provider(cls, value: str) -> str:
        if isinstance(value, str):
            return value.lower().strip()
        return value


def _load_from_astra_config() -> Dict[str, Any]:
    section = get_config_section("memory", {})
    if not isinstance(section, dict):
        return {}

    embeddings = section.get("embeddings") if isinstance(section.get("embeddings"), dict) else {}
    ingest = section.get("ingest") if isinstance(section.get("ingest"), dict) else {}
    features = section.get("features") if isinstance(section.get("features"), dict) else {}

    return {
        "redis_url": section.get("redis_url"),
        "qdrant_url": section.get("qdrant_url"),
        "ollama_api_url": section.get("ollama_api_url"),
        "llm_provider": section.get("llm_provider"),
        "llm_model": section.get("llm_model"),
        "embedding_model_provider": embeddings.get("provider") if isinstance(embeddings, dict) else None,
        "embedding_model_name": embeddings.get("model") if isinstance(embeddings, dict) else None,
        "embedding_cache_ttl_seconds": embeddings.get("cache_ttl_seconds") if isinstance(embeddings, dict) else None,
        "recall_cache_enabled": features.get("recall_cache_enabled") if isinstance(features, dict) else None,
        "recall_cache_ttl_seconds": features.get("recall_cache_ttl_seconds") if isinstance(features, dict) else None,
        "recall_cooldown_seconds": features.get("recall_cooldown_seconds") if isinstance(features, dict) else None,
        "recall_rate_limit_per_minute": features.get("recall_rate_limit_per_minute") if isinstance(features, dict) else None,
        "ingest_queue_name": ingest.get("queue_name") if isinstance(ingest, dict) else None,
        "ingest_batch_size": ingest.get("batch_size") if isinstance(ingest, dict) else None,
        "ingest_batch_timeout_ms": ingest.get("batch_timeout_ms") if isinstance(ingest, dict) else None,
        "memory_mask_pii": features.get("mask_pii") if isinstance(features, dict) else None,
        "openai_api_key": section.get("openai_api_key"),
    }


if USE_ASTRA_CONFIG:
    overrides = {k: v for k, v in _load_from_astra_config().items() if v is not None}
    settings = Settings(**overrides)
else:
    settings = Settings()


print(f"[CONFIG] use_astra_config={USE_ASTRA_CONFIG}")
print(f"[CONFIG] env_file = {Settings.model_config.get('env_file')}")
print(f"[CONFIG] llm_provider={settings.llm_provider} llm_model={settings.llm_model}")
print(f"[CONFIG] embedding_provider={settings.embedding_model_provider} embedding_model={settings.embedding_model_name}")
print(f"[CONFIG] ollama_api_url={settings.ollama_api_url}")
