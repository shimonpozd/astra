from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover - dotenv is optional at runtime
    load_dotenv = None  # type: ignore

if load_dotenv:
    dotenv_path = Path(__file__).resolve().parent.parent / '.env'
    if dotenv_path.exists():
        load_dotenv(dotenv_path=str(dotenv_path), override=False)

USE_ASTRA_CONFIG = os.getenv('ASTRA_CONFIG_ENABLED', 'false').lower() in {'1', 'true', 'yes'}

_get_config_section = None
if USE_ASTRA_CONFIG:
    try:
        from config import get_config_section as _get_config_section  # type: ignore
    except Exception as exc:  # pragma: no cover - defensive fallback
        USE_ASTRA_CONFIG = False
        _get_config_section = None
        print(f"[CONFIG] failed to enable central config for brain settings: {exc}")


def _config_value(path: str) -> Any:
    if USE_ASTRA_CONFIG and _get_config_section:
        return _get_config_section(path, None)
    return None


def _env_value(name: str) -> Optional[str]:
    return os.getenv(name)


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'1', 'true', 'yes', 'on'}:
            return True
        if lowered in {'0', 'false', 'no', 'off'}:
            return False
    return default


def _coerce_str(value: Any, default: Optional[str]) -> Optional[str]:
    if value is None:
        return default
    stringified = str(value).strip()
    return stringified if stringified else default


def _int_setting(path: str, env_name: str, default: int) -> int:
    value = _config_value(path)
    if value is None:
        value = _env_value(env_name)
    return _coerce_int(value, default)


def _bool_setting(path: str, env_name: str, default: bool) -> bool:
    value = _config_value(path)
    if value is None:
        value = _env_value(env_name)
    return _coerce_bool(value, default)


def _str_setting(path: str, env_name: str, default: Optional[str] = None) -> Optional[str]:
    value = _config_value(path)
    if value is None:
        value = _env_value(env_name)
    return _coerce_str(value, default)


REDIS_URL = _str_setting('services.redis_url', 'REDIS_URL', 'redis://localhost:6379/0')
MEMORY_SERVICE_URL = _str_setting('services.memory_service_url', 'MEMORY_SERVICE_URL')
TTS_SERVICE_URL = _str_setting('services.tts_service_url', 'TTS_SERVICE_URL')
STT_SERVICE_URL = _str_setting('services.stt_service_url', 'STT_SERVICE_URL')

DEFAULT_RESEARCH_DEPTH = _int_setting('research.default_depth', 'DEFAULT_RESEARCH_DEPTH', 15)
MAX_RESEARCH_DEPTH = _int_setting('research.max_depth', 'ASTRA_MAX_RESEARCH_DEPTH', 2)
CURATOR_MAX_CANDIDATES = _int_setting('research.curator_max_candidates', 'ASTRA_CURATOR_MAX_CANDIDATES', 30)
NOTE_MAX_CHARS = _int_setting('research.note_max_chars', 'ASTRA_RESEARCH_NOTE_MAX_CHARS', 3500)
ITERATION_MIN = _int_setting('research.iterations.min', 'ASTRA_ITER_MIN', 4)
ITERATION_MAX = _int_setting('research.iterations.max', 'ASTRA_ITER_MAX', 8)
ITERATION_BASE = _int_setting('research.iterations.base', 'ASTRA_ITER_BASE', 3)
ITERATION_DEPTH_DIVISOR = _int_setting('research.iterations.depth_divisor', 'ASTRA_ITER_DEPTH_DIVISOR', 5)

DRASHA_EXPORT_DIR = _str_setting('export.drasha.dir', 'DRASHA_EXPORT_DIR', 'exports')
AUTO_EXPORT_ENABLED = _bool_setting('export.drasha.auto_export', 'DRASHA_AUTO_EXPORT', True)

CHAIN_OF_THOUGHT_ENABLED = _bool_setting('debug.chain_of_thought', 'ASTRA_CHAIN_OF_THOUGHT', False)


# Voice Settings
VOICE_STT_PROVIDER = _str_setting('voice.stt.provider', 'ASTRA_STT_PROVIDER', 'whisper')
VOICE_TTS_PROVIDER = _str_setting('voice.tts.provider', 'ASTRA_TTS_PROVIDER', 'xtts')

# Personalities
DEFAULT_PERSONALITY = _str_setting('personalities.default', 'ASTRA_PERSONALITY', 'default')
PERSONALITIES_PATH = _str_setting('personalities.path', 'ASTRA_PERSONALITIES_PATH', 'personalities')

# Launcher enabled services
LAUNCHER_ENABLED_SERVICES = _config_value('launcher.enabled_services') or {}


__all__ = [
    'USE_ASTRA_CONFIG',
    'REDIS_URL',
    'MEMORY_SERVICE_URL',
    'TTS_SERVICE_URL',
    'STT_SERVICE_URL',
    'DEFAULT_RESEARCH_DEPTH',
    'MAX_RESEARCH_DEPTH',
    'CURATOR_MAX_CANDIDATES',
    'NOTE_MAX_CHARS',
    'ITERATION_MIN',
    'ITERATION_MAX',
    'ITERATION_BASE',
    'ITERATION_DEPTH_DIVISOR',
    'CHAIN_OF_THOUGHT_ENABLED',
    'DRASHA_EXPORT_DIR',
    'AUTO_EXPORT_ENABLED',
    'VOICE_STT_PROVIDER',
    'VOICE_TTS_PROVIDER',
    'DEFAULT_PERSONALITY',
    'PERSONALITIES_PATH',
    'LAUNCHER_ENABLED_SERVICES',
]
