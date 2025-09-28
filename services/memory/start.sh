#!/bin/sh

# Start the ingest worker in the background
python -m worker.ingest_worker &

# Start the FastAPI application
uvicorn app.main:app --host 0.0.0.0 --port 80
