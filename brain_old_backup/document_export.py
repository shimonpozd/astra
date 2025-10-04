import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .settings import DRASHA_EXPORT_DIR, AUTO_EXPORT_ENABLED

DEFAULT_EXPORT_DIR = DRASHA_EXPORT_DIR

@dataclass
class ExportRecord:
    user_id: str
    agent_id: str
    prompt: str
    response: str
    timestamp: str
    messages: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)

def ensure_export_dir(path: str | Path) -> Path:
    export_dir = Path(path)
    export_dir.mkdir(parents=True, exist_ok=True)
    return export_dir

def build_filename(prefix: str, user_id: str, agent_id: str, suffix: str = "json") -> str:
    safe_user = user_id.replace(os.sep, "_")
    safe_agent = agent_id.replace(os.sep, "_")
    return f"{prefix}_{safe_user}_{safe_agent}.{suffix}"

def export_plain_document(
    *,
    user_id: str,
    agent_id: str,
    prompt: str,
    response: str,
    messages: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    export_dir: str | Path = DEFAULT_EXPORT_DIR,
) -> Path:
    """Save a raw drasha interaction to disk as JSON."""
    export_path = ensure_export_dir(export_dir)
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    record = ExportRecord(
        user_id=user_id,
        agent_id=agent_id,
        prompt=prompt,
        response=response,
        timestamp=timestamp,
        messages=messages,
        metadata=metadata,
    )
    filename = build_filename(timestamp, user_id, agent_id)
    file_path = export_path / filename
    file_path.write_text(record.to_json(), encoding="utf-8")
    return file_path

