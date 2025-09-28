try:
    import tomllib
except ImportError:
    import tomli as tomllib
import toml
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
DEFAULTS_DIR = PROMPTS_DIR / "defaults"
OVERRIDES_DIR = PROMPTS_DIR / "overrides"

_prompt_cache: Optional[Dict[str, Any]] = None

def _deep_merge_dict(source, destination):
    """
    Recursively merges source dict into destination dict.
    """
    for key, value in source.items():
        if isinstance(value, dict) and key in destination and isinstance(destination[key], dict):
            destination[key] = _deep_merge_dict(value, destination[key])
        else:
            destination[key] = value
    return destination

def _load_all_prompts(force_reload: bool = False) -> Dict[str, Any]:
    """
    Loads all prompts from the defaults and overrides directories, merging them.
    Caches the result.
    """
    global _prompt_cache
    if not force_reload and _prompt_cache is not None:
        return _prompt_cache

    all_prompts = {}
    # Load defaults
    for toml_file in DEFAULTS_DIR.glob("*.toml"):
        domain = toml_file.stem
        with open(toml_file, "rb") as f:
            try:
                all_prompts[domain] = tomllib.load(f)
            except tomllib.TOMLDecodeError:
                logger.error(f"Error decoding {toml_file}", exc_info=True)

    # Load overrides and merge them
    for toml_file in OVERRIDES_DIR.glob("*.toml"):
        domain = toml_file.stem
        with open(toml_file, "rb") as f:
            try:
                overrides = tomllib.load(f)
                if domain in all_prompts:
                    all_prompts[domain] = _deep_merge_dict(overrides, all_prompts[domain])
                else:
                    all_prompts[domain] = overrides
            except tomllib.TOMLDecodeError:
                logger.error(f"Error decoding override {toml_file}", exc_info=True)

    _prompt_cache = all_prompts
    return all_prompts

def list_prompts() -> List[Dict[str, Any]]:
    """
    Lists all available prompts with their metadata.
    """
    prompts_data = _load_all_prompts()
    prompt_list = []
    for domain, prompts in prompts_data.items():
        for name, data in prompts.items():
            prompt_list.append({
                "id": data.get("id", f"{domain}.{name}"),
                "domain": domain,
                "name": name,
                "description": data.get("description", ""),
            })
    return prompt_list

def get_prompt(prompt_id: str, force_reload: bool = False) -> Optional[str]:
    """
    Retrieves the text of a specific prompt by its ID (e.g., 'deep_research.critic').
    """
    try:
        domain, name = prompt_id.split('.', 1)
    except ValueError:
        logger.error(f"Invalid prompt_id format: '{prompt_id}'. Expected 'domain.name'.")
        return None

    prompts = _load_all_prompts(force_reload=force_reload)
    return prompts.get(domain, {}).get(name, {}).get("text")

def update_prompt(prompt_id: str, text: str) -> bool:
    """
    Updates a prompt's text and saves it to the overrides directory.
    """
    try:
        domain, name = prompt_id.split('.', 1)
    except ValueError:
        logger.error(f"Invalid prompt_id format for update: '{prompt_id}'.")
        return False

    override_file = OVERRIDES_DIR / f"{domain}.toml"
    
    overrides = {}
    if override_file.exists():
        with open(override_file, "rb") as f:
            try:
                overrides = tomllib.load(f)
            except tomllib.TOMLDecodeError:
                logger.error(f"Could not decode existing override file {override_file}, it will be overwritten.")

    # Update the specific prompt text
    if name not in overrides:
        overrides[name] = {}
    overrides[name]["text"] = text
    overrides[name]["id"] = prompt_id # Ensure id is preserved

    try:
        with open(override_file, "w", encoding="utf-8") as f:
            toml.dump(overrides, f)
        # Invalidate cache
        global _prompt_cache
        _prompt_cache = None
        logger.info(f"Successfully updated prompt '{prompt_id}' in {override_file}")
        return True
    except Exception:
        logger.error(f"Failed to write updated prompt '{prompt_id}' to {override_file}", exc_info=True)
        return False
