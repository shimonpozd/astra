# Astra LTM Service

This service provides long-term memory for the Astra voice assistant using mem0 and Qdrant.

## Endpoints

- `POST /ltm/recall`: Retrieves memories from LTM.
- `POST /ltm/store`: Queues memories for asynchronous storage.
- `GET /healthz`: Health check.

## Architecture

- **API:** FastAPI
- **LTM Logic:** mem0
- **Vector DB:** Qdrant
- **Cache/Queue:** Redis
- **Async Worker:** A separate process reads from a Redis queue to batch-insert memories into Qdrant.
