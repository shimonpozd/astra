import sys
import os
sys.path.append(os.path.dirname(__file__) + '/..')
import logging_utils
import time
from io import BytesIO
import base64
import requests
import httpx
import threading
import asyncio
from typing import Optional
import numpy as np
from pathlib import Path

import uvicorn
from audio.settings import (
    REDIS_URL as SETTINGS_REDIS_URL,
    STT_PROVIDER as SETTINGS_STT_PROVIDER,
    STT_BRAIN_ENDPOINT,
    WHISPER_MODEL_PATH,
    WHISPER_COMPUTE_TYPE,
    WHISPER_DEVICE,
    WHISPER_FORCED_LANGUAGE,
    DEEPGRAM_API_KEY as SETTINGS_DEEPGRAM_API_KEY,
)


import redis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import asyncio
from urllib.parse import urljoin

# --- Dynamic Imports for STT Providers ---
try:
    import torch
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

try:
    from deepgram import DeepgramClient, PrerecordedOptions, BufferSource
except ImportError:
    DeepgramClient = None

# --- Configuration ---
logger = logging_utils.get_logger("stt-service", service="stt")

import time

# Service discovery via centralized audio settings
BRAIN_URL = STT_BRAIN_ENDPOINT
REDIS_URL = SETTINGS_REDIS_URL

# STT Provider Choice
STT_PROVIDER = SETTINGS_STT_PROVIDER

# Whisper Configuration

def _resolve_whisper_model_path(configured_path: str) -> str:
    path_obj = Path(configured_path)
    if not path_obj.is_absolute():
        base_dir = Path(__file__).resolve().parent.parent
        path_obj = (base_dir / path_obj).resolve(strict=False)
    return str(path_obj)

MODEL_PATH = _resolve_whisper_model_path(WHISPER_MODEL_PATH)
COMPUTE_TYPE = WHISPER_COMPUTE_TYPE
DEVICE = WHISPER_DEVICE
FORCED_LANGUAGE = WHISPER_FORCED_LANGUAGE

# Deepgram Configuration
DEEPGRAM_API_KEY = SETTINGS_DEEPGRAM_API_KEY

# --- Global State ---
class ServiceState:
    def __init__(self):
        self.stt_client = None  # Can be WhisperModel or DeepgramClient
        self.redis_client: redis.Redis | None = None
        self.transcriptions_since_last_clear = 0

state = ServiceState()

# --- Data Models ---
class SttRequest(BaseModel):
    audio_data: str
    agent_id: Optional[str] = None
    session_id: Optional[str] = None

class SttResponse(BaseModel):
    text: str
    language: str
    transcription_time_ms: int

# --- Logic ---
def initialize_stt_client():
    """Initializes the appropriate STT client based on the environment configuration."""
    logger.info(f"Selected STT Provider: {STT_PROVIDER}")

    if STT_PROVIDER == "whisper":
        if not WhisperModel:
            raise RuntimeError("Whisper provider selected, but 'faster_whisper' is not installed.")
        if not os.path.exists(MODEL_PATH) or not os.path.isdir(MODEL_PATH):
            logger.error(f"Whisper model directory not found: {MODEL_PATH}")
            raise RuntimeError(f"Model directory not found at {MODEL_PATH}")
        
        logger.info(f"Loading Whisper model from: {MODEL_PATH} ({DEVICE}, {COMPUTE_TYPE})...")
        try:
            state.stt_client = WhisperModel(MODEL_PATH, device=DEVICE, compute_type=COMPUTE_TYPE)
            logger.info("Whisper model loaded successfully.")
        except Exception as e:
            raise RuntimeError(f"Failed to load Whisper model: {e}") from e

    elif STT_PROVIDER == "deepgram":
        if not DeepgramClient:
            raise RuntimeError("Deepgram provider selected, but 'deepgram-sdk' is not installed.")
        if not DEEPGRAM_API_KEY:
            raise RuntimeError("Deepgram provider selected, but DEEPGRAM_API_KEY is not set.")
        
        logger.info("Initializing Deepgram client...")
        try:
            state.stt_client = DeepgramClient(DEEPGRAM_API_KEY)
            logger.info("Deepgram client initialized successfully.")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Deepgram client: {e}") from e
    else:
        raise RuntimeError(f"Invalid STT_PROVIDER: '{STT_PROVIDER}'. Choose 'whisper' or 'deepgram'.")

async def notify_downstream(text: str, agent_id: Optional[str] = None, session_id: Optional[str] = None):
    """Sends the recognized text to the brain service and publishes it to Redis asynchronously."""
    # 1. Send to brain service
    try:
        logger.info(f"[{session_id or '-'}] Sending text to brain: '{text}'")
        payload = {"text": text}
        if agent_id:
            payload["agent_id"] = agent_id
        if session_id:
            payload["session_id"] = session_id
        async with httpx.AsyncClient() as client:
            await client.post(BRAIN_URL, json=payload, timeout=30)
    except httpx.RequestError as e:
        logger.error(f"Failed to contact brain-service: {e}")
    
    # 2. Publish to Redis pub/sub for other listeners
    if state.redis_client:
        try:
            logger.info(f"Publishing to 'astra:stt_recognized': '{text}'")
            state.redis_client.publish("astra:stt_recognized", text)
        except redis.exceptions.ConnectionError as e:
            logger.error(f"Failed to publish to Redis: {e}")

def _transcribe_whisper(audio_buffer: BytesIO) -> tuple[str, str]:
    """Helper function to run synchronous Whisper transcription in a thread pool."""
    segments, info = state.stt_client.transcribe(
        audio_buffer,
        beam_size=1,
        vad_filter=False,
        temperature=0.0,
        language=FORCED_LANGUAGE
    )
    full_text = " ".join([segment.text for segment in segments]).strip()
    
    # Periodically clear GPU cache
    if torch.cuda.is_available():
        state.transcriptions_since_last_clear += 1
        if state.transcriptions_since_last_clear >= 10:
            logger.info("Clearing GPU cache after 10 transcriptions.")
            torch.cuda.empty_cache()
            state.transcriptions_since_last_clear = 0
    
    return full_text, info.language

def _transcribe_deepgram(audio_bytes: bytes) -> tuple[str, str]:
    """Helper function to run synchronous Deepgram transcription in a thread pool."""
    payload: BufferSource = {'buffer': audio_bytes}
    options = PrerecordedOptions(
        model="nova-2",
        smart_format=True,
        language=FORCED_LANGUAGE,
    )
    response = state.stt_client.listen.prerecorded.v("1").transcribe_file(payload, options)
    full_text = response.results.channels[0].alternatives[0].transcript.strip()
    # Deepgram response doesn't easily yield the detected language like Whisper, so we return the forced one.
    return full_text, FORCED_LANGUAGE

# --- FastAPI App ---
app = FastAPI(title="STT Service", version="1.5.1")

class StreamingState:
    def __init__(self):
        self.active_websockets = set()
        self.audio_buffer = b""  # Buffer for accumulating audio chunks
        self.is_streaming = False

state.streaming_state = StreamingState()

@app.on_event("startup")
def startup_event():
    initialize_stt_client()
    try:
        state.redis_client = redis.from_url(REDIS_URL)
        state.redis_client.ping()
        logger.info("Successfully connected to Redis.")
    except Exception as e:
        logger.error(f"Could not connect to Redis: {e}")
        state.redis_client = None

@app.post("/stt", response_model=SttResponse)
async def recognize_speech(request: SttRequest):
    if not state.stt_client:
        raise HTTPException(status_code=503, detail="STT client is not initialized.")

    try:
        audio_bytes = base64.b64decode(request.audio_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error decoding audio_data: {e}")

    logger.info(f"Received {len(audio_bytes) / 1024:.2f} KB of audio for recognition.")
    start_time = time.time()
    stt_receive_time = time.time()
    full_text = ""
    language = FORCED_LANGUAGE

    try:
        if STT_PROVIDER == "whisper":
            audio_buffer = BytesIO(audio_bytes)
            audio_buffer.name = "audio.wav"
            full_text, language = await run_in_threadpool(_transcribe_whisper, audio_buffer)

        elif STT_PROVIDER == "deepgram":
            full_text, language = await run_in_threadpool(_transcribe_deepgram, audio_bytes)

        end_time = time.time()
        processing_time_ms = int((end_time - start_time) * 1000)

        if stt_receive_time:
            total_stt_time = (end_time - stt_receive_time) * 1000
            logger.info(f"Total STT processing: {total_stt_time:.2f} ms, transcription: {processing_time_ms:.2f} ms")

        if not full_text:
            logger.warning("Recognition result is empty, processing stopped.")
            return SttResponse(text="", language=language, transcription_time_ms=processing_time_ms)

        logger.info(f"Recognized: '{full_text}' in {processing_time_ms} ms. Language: {language}")
        
        asyncio.create_task(notify_downstream(full_text, request.agent_id, request.session_id))

        return SttResponse(text=full_text, language=language, transcription_time_ms=processing_time_ms)

    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error during audio processing: {e}")

@app.websocket("/ws/stt")
async def websocket_stt(websocket: WebSocket):
    """WebSocket endpoint for streaming STT"""
    await websocket.accept()
    state.streaming_state.active_websockets.add(websocket)
    logger.info(f"STT WebSocket connection established. Active: {len(state.streaming_state.active_websockets)}")
    
    buffer = b""
    try:
        while True:
            data = await websocket.receive_bytes()
            buffer += data
            
            # Process partial transcription every 2 seconds or on silence
            if len(buffer) > 32000:  # ~2s at 16kHz
                partial_text, confidence = await process_partial_audio(buffer)
                if partial_text:
                    await websocket.send_json({
                        "type": "partial",
                        "text": partial_text,
                        "confidence": confidence,
                        "timestamp": time.time()
                    })
                    logger.debug(f"Partial transcription: {partial_text} (confidence: {confidence})")
                buffer = b""  # Reset buffer after processing
            
    except WebSocketDisconnect:
        state.streaming_state.active_websockets.remove(websocket)
        logger.info(f"STT WebSocket closed. Active: {len(state.streaming_state.active_websockets)}")
    except Exception as e:
        logger.error(f"STT WebSocket error: {e}")
        state.streaming_state.active_websockets.remove(websocket)

async def process_partial_audio(audio_data: bytes) -> tuple[str, float]:
    """Process partial audio buffer with Whisper"""
    try:
        # Convert raw bytes to a float32 numpy array as expected by Whisper
        np_chunk = np.frombuffer(audio_data, dtype=np.int16)
        audio_float = np_chunk.astype(np.float32) / 32768.0

        segments, info = state.stt_client.transcribe(
            audio_float,
            beam_size=1,
            vad_filter=False,
            temperature=0.0,
            language=FORCED_LANGUAGE
        )
        partial_text = " ".join([segment.text for segment in segments if segment.no_speech_prob < 0.6]).strip()
        confidence = np.mean([segment.no_speech_prob for segment in segments]) if segments else 0.0
        
        # Periodically clear GPU cache
        if torch.cuda.is_available():
            state.transcriptions_since_last_clear += 1
            if state.transcriptions_since_last_clear >= 10:
                logger.info("Clearing GPU cache after 10 transcriptions.")
                torch.cuda.empty_cache()
                state.transcriptions_since_last_clear = 0
        
        return partial_text, 1.0 - confidence
    except Exception as e:
        logger.error(f"Partial transcription error: {e}")
        return "", 0.0

@app.get("/health")
async def health_check():
    """Health check endpoint for STT service."""
    stt_ready = state.stt_client is not None
    brain_ready = False
    
    # Check brain service health
    try:
        # Derive health URL from BRAIN_URL
        base_brain_url = urljoin(BRAIN_URL, '.')
        health_url = urljoin(base_brain_url, 'health')
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
            response.raise_for_status()
            # Assuming brain returns a JSON with a "status" key
            brain_status = response.json().get("status")
            if brain_status == "healthy":
                brain_ready = True
    except Exception as e:
        logger.warning(f"Downstream health check for brain-service failed: {e}")
        brain_ready = False

    # Determine overall health
    is_healthy = stt_ready and brain_ready
    
    response_status_code = 200 if is_healthy else 503 # Service Unavailable
    
    return JSONResponse(
        status_code=response_status_code,
        content={
            "status": "healthy" if is_healthy else "unhealthy",
            "checks": {
                "stt_model_loaded": stt_ready,
                "redis_connected": state.redis_client is not None,
                "downstream_brain_service": "healthy" if brain_ready else "unhealthy"
            }
        }
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7020)