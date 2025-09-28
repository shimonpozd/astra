try:
    import tomllib
except ImportError:
    import tomli as tomllib
import toml
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging
import os

logger = logging.getLogger(__name__)

PERSONALITIES_DIR = Path(__file__).parent.parent / "prompts" / "personalities"

# Ensure the directory exists
PERSONALITIES_DIR.mkdir(exist_ok=True)

def _load_personality(file_path: Path) -> Optional[Dict[str, Any]]:
    """Loads a single personality from a TOML file."""
    if not file_path.exists():
        return None
    with open(file_path, "rb") as f:
        try:
            return tomllib.load(f)
        except tomllib.TOMLDecodeError:
            logger.error(f"Error decoding personality file: {file_path}", exc_info=True)
            return None

def list_personalities() -> List[Dict[str, Any]]:
    """Lists metadata for all available personalities."""
    personalities = []
    for toml_file in PERSONALITIES_DIR.glob("*.toml"):
        personality_data = _load_personality(toml_file)
        if personality_data:
            personalities.append({
                "id": personality_data.get("id", toml_file.stem),
                "name": personality_data.get("name", toml_file.stem),
                "description": personality_data.get("description", ""),
                "flow": personality_data.get("flow", "conversational"),
            })
    return personalities

def get_personality(id: str) -> Optional[Dict[str, Any]]:
    """Gets the full details for a single personality."""
    file_path = (PERSONALITIES_DIR / f"{id}.toml").resolve()
    # Security check to prevent path traversal
    if PERSONALITIES_DIR.resolve() not in file_path.parents:
        logger.warning(f"Attempted path traversal for personality ID: {id}")
        return None
    return _load_personality(file_path)

def create_personality(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Creates a new personality file."""
    id = data.get("id")
    if not id or not isinstance(id, str) or not id.isalnum():
        logger.error(f"Invalid or missing ID for new personality: {id}")
        return None

    file_path = PERSONALITIES_DIR / f"{id}.toml"
    if file_path.exists():
        logger.error(f"Personality with ID '{id}' already exists.")
        return None

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            toml.dump(data, f)
        logger.info(f"Created new personality: {id}")
        return data
    except Exception:
        logger.error(f"Failed to create personality file for {id}", exc_info=True)
        return None

def update_personality(id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Updates an existing personality file."""
    file_path = (PERSONALITIES_DIR / f"{id}.toml").resolve()
    if PERSONALITIES_DIR.resolve() not in file_path.parents or not file_path.exists():
        logger.error(f"Personality with ID '{id}' not found for update.")
        return None

    # Ensure the ID in the data matches the file ID
    data['id'] = id

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            toml.dump(data, f)
        logger.info(f"Updated personality: {id}")
        return data
    except Exception:
        logger.error(f"Failed to update personality file for {id}", exc_info=True)
        return None

def delete_personality(id: str) -> bool:
    """Deletes a personality file."""
    file_path = (PERSONALITIES_DIR / f"{id}.toml").resolve()
    if PERSONALITIES_DIR.resolve() not in file_path.parents or not file_path.exists():
        logger.error(f"Personality with ID '{id}' not found for deletion.")
        return False

    try:
        os.remove(file_path)
        logger.info(f"Deleted personality: {id}")
        return True
    except Exception:
        logger.error(f"Failed to delete personality file for {id}", exc_info=True)
        return False
