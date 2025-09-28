
import logging
import time
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from openai import OpenAI
from typing import List, Optional, Tuple, Dict, Any

from .config import settings
from . import metrics

logger = logging.getLogger(__name__)

# --- Helper Functions (as suggested) ---
def _norm_speaker(mem: dict) -> str:
    """Robustly extracts and normalizes the speaker's name from various possible keys."""
    val = (
        mem.get("speaker_name")
        or mem.get("speaker")
        or mem.get("speaker_id")
        or mem.get("speaker, id")  # Handle observed malformed key
        or ""
    )
    name = str(val).strip()
    if name.isdigit():
        return ""  # Discard numeric IDs
    low = name.lower()
    if low in {"казах", "kazah"}:
        return "Казах"
    if low in {"шимон", "shimon"}:
        return "Шимон"
    return name or ""

def _role_of(name: str) -> str:
    """Maps a normalized name to a system role."""
    low = (name or "").lower()
    if low == "казах":
        return "assistant"
    if low == "шимон":
        return "user"
    return "other"

class KGraphQdrant:
    def __init__(self):
        self.qdrant_cli = QdrantClient(url=settings.qdrant_url)
        self.openai_cli = OpenAI(api_key=settings.openai_api_key)
        self.collection_name = settings.k_graph_collection_name
        self._ensure_collection_exists()

    def _ensure_collection_exists(self):
        """Checks if the configured Qdrant collection exists and raises an error if not."""
        try:
            self.qdrant_cli.get_collection(collection_name=self.collection_name)
            logger.info(f"K-Graph: Successfully connected to collection '{self.collection_name}'.")
        except Exception as e:
            logger.error(f"K-Graph: Collection '{self.collection_name}' not found or Qdrant is unreachable. Please ensure the collection exists and the name is correct in your settings. Error: {e}")
            raise ValueError(f"Collection '{self.collection_name}' not found.") from e

    def get_knowledge_for_topic(self, topic_label: str) -> Tuple[List[str], Optional[str], List[dict], Optional[float]]:
        """Gets facts for a topic using a robust, multi-layered search strategy."""
        if not topic_label:
            return [], None, [], None

        start_time = time.time()
        name_norm = topic_label.strip().casefold()

        try:
            # Since the dataset is small and not indexed for semantic search, 
            # we rely on filtering, with a full scan as the most reliable method.
            
            # Primary Strategy: Full scan and manual filtering in Python
            # This is the most reliable method given the data quality issues.
            logger.info(f"K-Graph: Starting full collection scan for '{topic_label}'.")
            all_points, next_offset = [], None
            while True:
                points, next_offset = self.qdrant_cli.scroll(
                    collection_name=self.collection_name,
                    limit=250,
                    offset=next_offset,
                    with_payload=True
                )
                all_points.extend(points)
                if not next_offset:
                    break
            
            for point in all_points:
                payload = point.payload or {}
                participants = payload.get("persona", {}).get("participants", [])
                if isinstance(participants, list):
                    for participant in participants:
                        if isinstance(participant, dict) and participant.get("name", "").lower() == name_norm:
                            logger.info(f"K-Graph: Found match via full scan for participant '{topic_label}'.")
                            
                            # Smart fact extraction
                            facts_payload = payload.get("facts") or []
                            if not facts_payload:
                                mems = (payload.get("persona", {}) or {}).get("memories", []) or []
                                norm_mems = []
                                for m in mems:
                                    spk = _norm_speaker(m)
                                    if not spk: continue
                                    norm_mems.append({
                                        "speaker": spk,
                                        "role": _role_of(spk),
                                        "text": m.get("text", ""),
                                        "durability": m.get("durability", "short"),
                                    })
                                order = {"long": 0, "medium": 1, "short": 2}
                                norm_mems.sort(key=lambda x: order.get(x["durability"], 2))
                                facts_payload = [f"{m['speaker']}: {m['text']}" for m in norm_mems[:20]]

                            semantic_summary = payload.get("semantic_summary")
                            # The original memories list is returned for the full context
                            persona_memories = (payload.get("persona", {}) or {}).get("memories", [])
                            
                            return facts_payload, semantic_summary, persona_memories, 1.0

            logger.warning(f"K-Graph: No records found for participant '{topic_label}' after all fallbacks.")
            return [], None, [], None

        finally:
            metrics.record_qdrant_query((time.time() - start_time) * 1000)

# --- Global Instance ---
k_graph_client = KGraphQdrant()
