from qdrant_client import QdrantClient, models
from .config import settings
import logging

logger = logging.getLogger(__name__)


def ensure_collection_exists(collection_name: str):
    """Checks if a collection exists in Qdrant and creates it if it doesn't."""
    try:
        client = QdrantClient(url=settings.qdrant_url)
        try:
            client.get_collection(collection_name=collection_name)
            logger.info(f"Collection '{collection_name}' already exists.")
        except Exception: # The client throws a generic Exception if the collection is not found
            logger.info(f"Collection '{collection_name}' not found. Creating it.")
            client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(size=settings.embedding_dim, distance=models.Distance.COSINE),
            )
            logger.info(f"Collection '{collection_name}' created successfully.")
    except Exception as e:
        logger.error(f"Failed to ensure collection '{collection_name}' exists: {e}")
