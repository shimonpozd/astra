import logging_utils
import queue
import threading
import time
import numpy as np
import asyncio

from audio.settings import (
    REDIS_URL as SETTINGS_REDIS_URL,
    TTS_PROVIDER as SETTINGS_TTS_PROVIDER,
    XTTS_API_URL as SETTINGS_XTTS_API_URL,
    XTTS_SPEAKER_WAV as SETTINGS_XTTS_SPEAKER_WAV,
    ELEVENLABS_API_KEY as SETTINGS_ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID as SETTINGS_ELEVENLABS_VOICE_ID,
    ORPHEUS_API_URL as SETTINGS_ORPHEUS_API_URL,
)

import redis
import sounddevice as sd
import uvicorn
import requests
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# --- Provider-specific Imports ---
try:
    from elevenlabs.client import ElevenLabs
    from elevenlabs import play as elevenlabs_play
except ImportError:
    ElevenLabs, elevenlabs_play = None, None

# --- Configuration ---
logger = logging_utils.get_logger("tts-dispatcher-service", service="tts")

REDIS_URL = SETTINGS_REDIS_URL

# --- Provider Configuration ---
TTS_PROVIDER = SETTINGS_TTS_PROVIDER

# XTTS API Config
XTTS_API_URL = SETTINGS_XTTS_API_URL
XTTS_SPEAKER_WAV_PATH = SETTINGS_XTTS_SPEAKER_WAV

# ElevenLabs Config
ELEVENLABS_API_KEY = SETTINGS_ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID = SETTINGS_ELEVENLABS_VOICE_ID

# Orpheus Proxy Config
ORPHEUS_PROXY_URL = SETTINGS_ORPHEUS_API_URL

# --- Global State ---
class ServiceState:
    def __init__(self):
        self.tts_client = None # Can be proxy string or ElevenLabs client
        self.redis_client: redis.Redis | None = None
        self.queue = queue.Queue()
        self.worker_thread: threading.Thread | None = None

state = ServiceState()

# --- Data Models ---
class SpeakRequest(BaseModel):
    text: str

# --- Core Logic ---
def initialize_tts_client():
    """Initializes the appropriate TTS client or proxy based on configuration."""
    logger.info(f"Selected TTS Provider: {TTS_PROVIDER}")

    if TTS_PROVIDER == "xtts":
        logger.info(f"Configured to use XTTS API server at: {XTTS_API_URL}")
        try:
            response = requests.get(f"{XTTS_API_URL}/speakers_list", timeout=5)
            response.raise_for_status()
            logger.info("Successfully connected to XTTS API server.")
            state.tts_client = "xtts_api_proxy"
        except requests.RequestException as e:
            logger.error(f"Could not connect to XTTS API server. Error: {e}")
            state.tts_client = None

    elif TTS_PROVIDER == "elevenlabs":
        if not ElevenLabs:
            raise RuntimeError("ElevenLabs provider selected, but 'elevenlabs' library is not installed.")
        if not ELEVENLABS_API_KEY:
            raise RuntimeError("ElevenLabs provider selected, but ELEVENLABS_API_KEY is not set.")
        logger.info("Initializing ElevenLabs client...")
        state.tts_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    elif TTS_PROVIDER == "orpheus":
        logger.info(f"Configured to use Orpheus TTS service at: {ORPHEUS_PROXY_URL}")
        try:
            response = requests.get(f"{ORPHEUS_PROXY_URL}/v1/healthz", timeout=3.05)
            response.raise_for_status()
            logger.info("Successfully connected to Orpheus TTS service.")
            state.tts_client = "orpheus_api_proxy"
        except requests.RequestException as e:
            logger.error(f"Could not connect to Orpheus TTS service. Error: {e}")
            state.tts_client = None
    else:
        raise RuntimeError(f"Invalid TTS_PROVIDER: '{TTS_PROVIDER}'. Choose from [xtts, elevenlabs, orpheus]")

def speech_worker():
    """Worker thread that processes text from the queue and synthesizes speech."""
    while True:
        try:
            text = state.queue.get()
            if text is None: break
            
            logger.info(f"Processing text for TTS: '{text[:50]}...'")
            audio_np = None
            samplerate = 24000 # Default sample rate

            if TTS_PROVIDER == 'xtts':
                if state.tts_client != "xtts_api_proxy": continue
                try:
                    params = {"text": text, "speaker_wav": XTTS_SPEAKER_WAV_PATH, "language": "ru"}
                    response = requests.get(f"{XTTS_API_URL}/tts_stream", params=params, stream=True, timeout=30)
                    response.raise_for_status()
                    audio_data = b"".join([chunk for chunk in response.iter_content(chunk_size=1024)])
                    audio_np = np.frombuffer(audio_data, dtype=np.int16)
                except requests.RequestException as e:
                    logger.error(f"Failed to call XTTS API server: {e}")

            elif TTS_PROVIDER == 'elevenlabs':
                try:
                    audio_generator = state.tts_client.text_to_speech.convert(text=text, voice_id=ELEVENLABS_VOICE_ID)
                    audio_data = b"".join([chunk for chunk in audio_generator])
                    # ElevenLabs uses MP3, need to decode it. This is complex, skipping for now.
                    # For now, we assume the `play` function handles it.
                    elevenlabs_play(audio_data)
                except Exception as e:
                    logger.error(f"Failed during ElevenLabs synthesis: {e}")

            elif TTS_PROVIDER == 'orpheus':
                if state.tts_client != "orpheus_api_proxy": continue
                try:
                    payload = {"text": text} # Add other params from ENV later
                    response = requests.post(f"{ORPHEUS_PROXY_URL}/v1/tts/synthesize", json=payload, timeout=30)
                    response.raise_for_status()
                    audio_np = np.frombuffer(response.content, dtype=np.int16)
                except requests.RequestException as e:
                    logger.error(f"Failed to call Orpheus service: {e}")

            # Generic playback for numpy audio data
            if audio_np is not None:
                try:
                    sd.play(audio_np, samplerate)
                    time.sleep(len(audio_np) / samplerate * 1.05) # Wait for playback to finish
                    logger.info("Playback finished.")
                except Exception as e:
                    logger.error(f"Error playing audio: {e}")

            state.queue.task_done()
        except Exception as e:
            logger.error(f"Error in speech worker: {e}", exc_info=True)
            state.queue.task_done()

# --- FastAPI App ---
app = FastAPI(title="TTS Dispatcher Service", version="3.0.0")

@app.on_event("startup")
def startup_event():
    initialize_tts_client()
    state.worker_thread = threading.Thread(target=speech_worker, daemon=True)
    state.worker_thread.start()
    logger.info("Speech worker thread started.")

class TTSStreamRequest(BaseModel):
    text: str
    language: str = "ru"

@app.post("/stream")
async def tts_stream_handler(request: TTSStreamRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    async def stream_audio():
        logger.info(f"Streaming TTS for text: '{request.text[:50]}...' using {TTS_PROVIDER}")
        
        if TTS_PROVIDER == 'xtts':
            try:
                params = {"text": request.text, "speaker_wav": XTTS_SPEAKER_WAV_PATH, "language": request.language}
                async with httpx.AsyncClient() as client:
                    async with client.stream("GET", f"{XTTS_API_URL}/tts_stream", params=params, timeout=30) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_bytes():
                            yield chunk
            except Exception as e:
                logger.error(f"Failed to stream from XTTS API server: {e}", exc_info=True)

        elif TTS_PROVIDER == 'elevenlabs':
            if not ElevenLabs:
                logger.error("ElevenLabs provider selected, but library not installed.")
                return

            try:
                client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
                audio_generator = await asyncio.to_thread(
                    client.text_to_speech.convert,
                    text=request.text,
                    voice_id=ELEVENLABS_VOICE_ID
                )
                for chunk in audio_generator:
                    yield chunk
            except Exception as e:
                logger.error(f"Failed during ElevenLabs synthesis: {e}", exc_info=True)

        elif TTS_PROVIDER == 'orpheus':
            try:
                payload = {"text": request.text}
                async with httpx.AsyncClient() as client:
                    response = await client.post(f"{ORPHEUS_PROXY_URL}/v1/tts/synthesize", json=payload, timeout=30)
                    response.raise_for_status()
                    yield response.content
            except Exception as e:
                logger.error(f"Failed to call Orpheus service: {e}", exc_info=True)
        
        else:
            logger.error(f"TTS provider '{TTS_PROVIDER}' not configured for streaming.")

    return StreamingResponse(stream_audio(), media_type="audio/wav")

@app.post("/speak")
def speak(request: SpeakRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    state.queue.put(request.text)
    logger.info(f"Added to TTS queue: '{request.text[:50]}...'")
    return {"status": "ok"}

@app.post("/shutdown")
def shutdown():
    logger.info("Shutdown endpoint called. Initiating graceful shutdown.")
    try:
        if state.redis_client:
            state.redis_client.close()
            logger.info("Redis client closed.")
        if state.worker_thread and state.worker_thread.is_alive():
            # Signal worker to stop (assume queue.put(None) or event)
            state.queue.put(None)
            state.worker_thread.join(timeout=5)
            if state.worker_thread.is_alive():
                logger.warning("Worker thread did not stop gracefully, forcing.")
            logger.info("Worker thread stopped.")
        # Close sounddevice if needed
        logger.info("All resources cleaned up. Exiting.")
        import sys
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
        import sys
        sys.exit(1)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7010)