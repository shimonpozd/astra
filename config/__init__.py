try:
    import tomllib
except ImportError:
    import tomli as tomllib
import toml
import os
import redis
import logging
from pathlib import Path
import collections.abc

logger = logging.getLogger(__name__)

# In-memory cache for the configuration
_config_cache = None
CONFIG_CHANNEL = "astra_config_channel"

def _deep_merge_dict(source, destination):
    """
    Recursively merges source dict into destination dict.
    """
    for key, value in source.items():
        if isinstance(value, collections.abc.Mapping) and key in destination and isinstance(destination[key], collections.abc.Mapping):
            destination[key] = _deep_merge_dict(value, destination[key])
        else:
            destination[key] = value
    return destination

def get_config(force_reload: bool = False):
    """
    Loads and merges configuration from TOML files.
    Caches the result unless force_reload is True.
    """
    global _config_cache
    if not force_reload and _config_cache is not None:
        return _config_cache

    config_dir = Path(__file__).parent
    defaults_path = config_dir / "defaults.toml"
    overrides_path = config_dir / "overrides.toml"
    
    config = {}
    if defaults_path.exists():
        with open(defaults_path, "rb") as f:
            config = tomllib.load(f)

    if overrides_path.exists():
        with open(overrides_path, "rb") as f:
            try:
                overrides = tomllib.load(f)
                # Correct order: overrides are merged into defaults
                config = _deep_merge_dict(overrides, config)
            except tomllib.TOMLDecodeError:
                logger.error("Could not decode overrides.toml, skipping.", exc_info=True)

    _config_cache = config
    return config

def update_config(new_settings: dict):
    """
    Updates the overrides.toml file, reloads the configuration, and notifies listeners.
    """
    config_dir = Path(__file__).parent
    overrides_path = config_dir / "overrides.toml"
    
    overrides = {}
    if overrides_path.exists():
        with open(overrides_path, "rb") as f:
            try:
                overrides = tomllib.load(f)
            except tomllib.TOMLDecodeError:
                logger.error("Could not decode overrides.toml before update, starting fresh.", exc_info=True)

    # Correct order: new settings are merged into existing overrides
    updated_overrides = _deep_merge_dict(new_settings, overrides)
    
    with open(overrides_path, "w") as f:
        toml.dump(updated_overrides, f)
        
    # Force reload the configuration to reflect the changes
    updated_config = get_config(force_reload=True)

    # Notify listeners via Redis Pub/Sub
    try:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        r = redis.from_url(redis_url)
        r.publish(CONFIG_CHANNEL, "config_updated")
        logger.info(f"Published config update notification to Redis channel '{CONFIG_CHANNEL}'.")
    except Exception as e:
        logger.error(f"Failed to publish config update notification to Redis: {e}", exc_info=True)

    return updated_config

def get_config_section(path: str, default=None):
    """
    Retrieves a specific value from the configuration using a dot-separated path.
    """
    keys = path.split('.')
    value = get_config()
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return default
    return value if value is not None else default