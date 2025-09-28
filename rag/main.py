import logging_utils
import os
import uuid

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from qdrant_client import QdrantClient, models
from pydantic import BaseModel

# --- Конфигурация ---
logger = logging_utils.get_logger("rag.main", service="rag")

# Загрузка OPENAI_API_KEY из .env
load_dotenv()

# Модель эмбеддингов OpenAI
EMBEDDING_MODEL_NAME = "text-embedding-3-small"
# Размер вектора для text-embedding-3-small
VECTOR_SIZE = 1536

# Настройки Qdrant
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
QDRANT_COLLECTION_NAME = "rag_documents_openai"

# --- Глобальное состояние ---
class ServiceState:
    def __init__(self):
        self.openai_client = None
        self.qdrant_client = None

state = ServiceState()

# --- Модели данных (остаются такими же) ---
class IngestRequest(BaseModel):
    doc_id: str
    chunks: list[str]
    personality_id: str | None = None # ID личности для этого документа

class IngestResponse(BaseModel):
    message: str
    indexed_chunks: int

class SearchRequest(BaseModel):
    query: str
    top_k: int = 3
    personality_id: str | None = None # Фильтр по личности

class ChunkResult(BaseModel):
    doc_id: str
    text: str
    score: float

class SearchResponse(BaseModel):
    chunks: list[ChunkResult]

# --- FastAPI приложение ---
app = FastAPI(
    title="RAG Service (OpenAI)",
    description="Индексирует документы и выполняет поиск с помощью OpenAI Embeddings.",
    version="1.2.0" # Версия обновлена
)

@app.on_event("startup")
def startup_event():
    """Инициализация клиентов OpenAI и Qdrant."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY не найден в .env файле.")
    
    state.openai_client = OpenAI(api_key=api_key)
    logger.info("Клиент OpenAI инициализирован.")

    logger.info(f"Подключение к Qdrant на {QDRANT_HOST}:{QDRANT_PORT}...")
    state.qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    
    try:
        collections = state.qdrant_client.get_collections().collections
        collection_names = [c.name for c in collections]
        if QDRANT_COLLECTION_NAME not in collection_names:
            logger.info(f"Создание новой коллекции Qdrant: '{QDRANT_COLLECTION_NAME}'")
            state.qdrant_client.recreate_collection(
                collection_name=QDRANT_COLLECTION_NAME,
                vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE)
            )
    except Exception as e:
        raise RuntimeError(f"Ошибка при работе с Qdrant: {e}")

@app.post("/ingest", response_model=IngestResponse)
def ingest_documents(request: IngestRequest):
    """Получает эмбеддинги от OpenAI и сохраняет их в Qdrant."""
    if not all([state.openai_client, state.qdrant_client]):
        raise HTTPException(status_code=503, detail="Сервис не инициализирован.")

    try:
        # Получаем эмбеддинги для всех чанков одним запросом
        response = state.openai_client.embeddings.create(input=request.chunks, model=EMBEDDING_MODEL_NAME)
        vectors = [item.embedding for item in response.data]

        points_to_upsert = [
            models.PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={"doc_id": request.doc_id, "text": chunk_text, "personality_id": request.personality_id}
            )
            for vector, chunk_text in zip(vectors, request.chunks)
        ]

        state.qdrant_client.upsert(
            collection_name=QDRANT_COLLECTION_NAME,
            points=points_to_upsert,
            wait=True
        )
        return IngestResponse(message="Документ успешно проиндексирован.", indexed_chunks=len(points_to_upsert))

    except Exception as e:
        logger.error(f"Ошибка при индексации: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search", response_model=SearchResponse)
def search_documents(request: SearchRequest):
    """Создает эмбеддинг для запроса и ищет в Qdrant с фильтрацией."""
    if not all([state.openai_client, state.qdrant_client]):
        raise HTTPException(status_code=503, detail="Сервис не инициализирован.")

    try:
        response = state.openai_client.embeddings.create(input=[request.query], model=EMBEDDING_MODEL_NAME)
        query_vector = response.data[0].embedding

        # Фильтр по personality_id
        query_filter = None
        if request.personality_id:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(key="personality_id", match=models.MatchValue(value=request.personality_id))
                ]
            )
            logger.info(f"Применяется фильтр по личности: {request.personality_id}")

        search_results = state.qdrant_client.search(
            collection_name=QDRANT_COLLECTION_NAME,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=request.top_k
        )
        
        response_chunks = [
            ChunkResult(doc_id=hit.payload["doc_id"], text=hit.payload["text"], score=hit.score)
            for hit in search_results
        ]
        return SearchResponse(chunks=response_chunks)

    except Exception as e:
        logger.error(f"Ошибка при поиске: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7060)