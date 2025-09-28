import sys
import os
sys.path.append(os.path.dirname(__file__) + '/..')
import logging_utils
import threading
import wave
from io import BytesIO
import uuid
import base64
import os

import numpy as np
import pyaudio
import requests
import redis
import json
import torch
import uvicorn
import httpx
from urllib.parse import urljoin
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import asyncio
import psutil
import websockets
from websockets.exceptions import ConnectionClosed

# Optional audio processing libraries
try:
    import noisereduce as nr
    from pydub import AudioSegment
    from pydub.effects import normalize, compress_dynamic_range
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False

from collections import deque
# --- Configuration ---
import time
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Metrics tracking
vad_start_time = None
stt_send_time = None
logger = logging_utils.get_logger("voice-in-service", service="voice-in")

app = FastAPI(title="Voice-In Service (Silero VAD)", version="2.5.0")

# --- VAD Settings (Tunable) ---
VAD_THRESHOLD = 0.45      # Более чувствительный
THRESH_SPEECH = 0.55      # Быстрее активация
THRESH_SILENCE = 0.40     # Менее агрессивная остановка
MIN_SILENCE_MS = int(os.getenv("VOICE_MIN_SILENCE_MS", "800")) # Быстрее детект окончания
SPEECH_PAD_MS  = 80       # Меньше padding
MAX_SEGMENT_MS = 30000    # опционально ограничим длину фразы
CHUNK_SAMPLES = 512       # Required chunk size for Silero VAD at 16kHz


# --- Audio Settings ---
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000

STT_SERVICE_URL = "http://localhost:7020/stt"
STT_STREAM_URL = "ws://localhost:7020/ws/stt"
AGENT_ID = os.getenv("ASTRA_AGENT_ID", "default")

# Streaming config
STREAMING_ENABLED = os.getenv("VOICE_STREAMING_ENABLED", "false").lower() == "true"
CHUNK_DURATION_MS = int(os.getenv("VOICE_CHUNK_DURATION_MS", "2000"))

# Audio processing config
NOISE_REDUCTION_ENABLED = os.getenv("VOICE_NOISE_REDUCTION", "false").lower() == "true"
AUDIO_NORMALIZATION_ENABLED = os.getenv("VOICE_AUDIO_NORMALIZATION", "false").lower() == "true"

# DEBUG: Write AGENT_ID to a file for verification
try:
    with open("voice_in_agent_id_debug.txt", "w") as f:
        f.write(f"AGENT_ID: {AGENT_ID}\n")
except Exception as e:
    logger.error(f"Failed to write AGENT_ID debug file: {e}")


# --- Global State ---
from enum import Enum

class VoiceState(Enum):
    LISTENING = 1
    PROCESSING = 2
    SPEAKING = 3
    INTERRUPTED = 4

class StateManager:
    def __init__(self):
        self.current_state = VoiceState.LISTENING
        self.lock = threading.Lock()
    
    def transition(self, event):
        with self.lock:
            if self.current_state == VoiceState.LISTENING and event == "speech_detected":
                self.current_state = VoiceState.PROCESSING
                logger.info("State transition: LISTENING -> PROCESSING")
            elif self.current_state == VoiceState.PROCESSING and event == "processing_complete":
                self.current_state = VoiceState.SPEAKING
                logger.info("State transition: PROCESSING -> SPEAKING")
            elif self.current_state == VoiceState.SPEAKING and event == "interrupt_detected":
                self.current_state = VoiceState.INTERRUPTED
                logger.info("State transition: SPEAKING -> INTERRUPTED")
                # Trigger TTS stop and return to LISTENING
                self.current_state = VoiceState.LISTENING
            elif self.current_state == VoiceState.INTERRUPTED and event == "interrupt_handled":
                self.current_state = VoiceState.LISTENING
                logger.info("State transition: INTERRUPTED -> LISTENING")

class ServiceState:
    def __init__(self):
        self.is_running = False
        self.audio_thread = None
        self.vad_model = None
        self.main_loop = None
        self.redis_client = None
        self.audio_queue = None
        self.websocket_sender_task = None
        self.active_websockets = set()
        self.streaming_buffer = b""
        self.streaming_active = False
        self.state_manager = StateManager()
        self.interrupt_threshold = float(os.getenv("VOICE_INTERRUPT_THRESHOLD", "0.70"))
        self.interrupt_min_duration = int(os.getenv("VOICE_INTERRUPT_MIN_DURATION", "300"))
        self.is_speaking = False  # TTS playing
        self.interrupt_active = False


state = ServiceState()


# --- Data Models ---
class StatusResponse(BaseModel):
    running: bool


# --- VAD Initialization ---
@app.on_event("startup")
async def load_model():
    logger.info("Loading Silero VAD model...")
    try:
        # Initialize Redis client
        try:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            state.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            state.redis_client.ping()
            logger.info("Successfully connected to Redis.")
            # Start the TTS state listener thread
            tts_listener_thread = threading.Thread(target=tts_state_listener, daemon=True)
            tts_listener_thread.start()
        except Exception as e:
            logger.warning(f"Could not connect to Redis: {e}. Interrupts will not work.")
            state.redis_client = None

        model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False
        )
        state.vad_model = model
        # We will use the model directly for chunk-by-chunk probability
        logger.info("Silero VAD model loaded successfully.")

        # Validate config
        validate_config()

        # Adaptive VAD calibration: Analyze 5s of silence (non-blocking)
        if os.getenv("VOICE_ADAPTIVE_THRESHOLDS", "false").lower() == "true":
            # Pass only the model, utils are not needed for calibration logic anymore
            asyncio.create_task(run_calibration_async(model))
            logger.info("Async VAD calibration started in background")
        else:
            logger.info("Adaptive calibration disabled")

        # Store the main event loop for thread-safe async calls
        state.main_loop = asyncio.get_running_loop()

        # Auto-start listening if enabled
        if os.getenv("VOICE_AUTO_START", "true").lower() == "true":
            logger.info("Auto-starting VAD pipeline...")
            if state.is_running:
                logger.warning("Service is already running, skipping auto-start.")
                return
            if not state.vad_model:
                logger.error("VAD model not loaded, cannot auto-start.")
                return
            
            state.is_running = True
            state.streaming_active = STREAMING_ENABLED
            if state.streaming_active:
                logger.info("Starting VAD pipeline with streaming enabled.")
                state.audio_queue = asyncio.Queue()
                state.websocket_sender_task = asyncio.create_task(websocket_sender())
            else:
                logger.info("Starting VAD pipeline with batch mode.")
            state.audio_thread = threading.Thread(target=vad_pipeline, daemon=True)
            state.audio_thread.start()
            logger.info("VAD pipeline started automatically on startup.")

    except Exception as e:
        raise RuntimeError(f"Could not load Silero VAD model: {e}")


def tts_state_listener():
    """Listens to Redis for TTS state changes."""
    if not state.redis_client:
        logger.info("Redis not connected, TTS state listener will not run.")
        return

    pubsub = state.redis_client.pubsub(ignore_subscribe_messages=True)
    try:
        pubsub.subscribe("astra:tts_state")
        logger.info("Subscribed to astra:tts_state Redis channel.")
        for message in pubsub.listen():
            try:
                data = json.loads(message['data'])
                status = data.get('status')
                if status == 'started':
                    state.is_speaking = True
                    logger.info("TTS started, entering interruptible state.")
                elif status == 'stopped':
                    state.is_speaking = False
                    logger.info("TTS stopped, leaving interruptible state.")
            except (json.JSONDecodeError, KeyError):
                logger.warning(f"Received invalid message on astra:tts_state: {message['data']}")
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Redis connection error in tts_state_listener: {e}. Listener stopped.")
    except Exception as e:
        logger.error(f"An unexpected error occurred in tts_state_listener: {e}")


def preprocess_audio(np_chunk: np.ndarray) -> np.ndarray:
    """Applies noise reduction and/or normalization to an audio chunk."""
    if not AUDIO_PROCESSING_AVAILABLE:
        return np_chunk

    processed_chunk = np_chunk

    if NOISE_REDUCTION_ENABLED:
        try:
            # noisereduce works on float32 data
            float_chunk = processed_chunk.astype(np.float32) / 32768.0
            reduced_float = nr.reduce_noise(y=float_chunk, sr=RATE)
            processed_chunk = (reduced_float * 32768.0).astype(np.int16)
        except Exception as e:
            logger.warning(f"Noise reduction failed: {e}")

    if AUDIO_NORMALIZATION_ENABLED:
        try:
            # pydub works with AudioSegment objects
            audio_seg = AudioSegment(
                processed_chunk.tobytes(),
                frame_rate=RATE,
                sample_width=processed_chunk.dtype.itemsize,
                channels=CHANNELS
            )
            normalized_seg = normalize(audio_seg)
            # As per spec, also apply compression
            compressed_seg = compress_dynamic_range(normalized_seg)
            processed_chunk = np.array(compressed_seg.get_array_of_samples())
        except Exception as e:
            logger.warning(f"Audio normalization failed: {e}")
    
    return processed_chunk


# --- Core Logic ---
def send_to_stt(audio_data: bytes):
    global stt_send_time
    if stt_send_time:
        send_duration = (time.time() - stt_send_time) * 1000
        logger.info(f"STT send preparation duration: {send_duration:.2f} ms")
        stt_send_time = None

    session_id = str(uuid.uuid4())
    logger.info(f"[{session_id}] Phrase detected, {len(audio_data) / 1024:.2f} KB. Sending to STT...")
    try:
        # Package as WAV in memory
        with BytesIO() as wav_io:
            with wave.open(wav_io, "wb") as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(pyaudio.get_sample_size(FORMAT))
                wf.setframerate(RATE)
                wf.writeframes(audio_data)
            wav_bytes = wav_io.getvalue()

        # Send as base64 string
        response = requests.post(
            STT_SERVICE_URL,
            json={"audio_data": base64.b64encode(wav_bytes).decode('ascii'), "agent_id": AGENT_ID, "session_id": session_id},
            timeout=10.0
        )
        response.raise_for_status()
        logger.info("Audio successfully sent to STT.")
    except Exception as e:
        logger.error(f"Error sending audio to STT service: {e}")

async def websocket_sender():
    """Manages a persistent WebSocket connection to the STT service, sending audio chunks from a queue."""
    while True:
        try:
            logger.info("Connecting to STT WebSocket...")
            async with websockets.connect(STT_STREAM_URL) as websocket:
                logger.info("STT WebSocket connection established.")
                while True:
                    chunk = await state.audio_queue.get()
                    await websocket.send(chunk)
                    state.audio_queue.task_done()
        except (websockets.exceptions.ConnectionClosedError, asyncio.CancelledError) as e:
            logger.warning(f"STT WebSocket connection closed: {e}. Reconnecting in 5s...")
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"An unexpected error occurred in websocket_sender: {e}")
            await asyncio.sleep(5) # Avoid rapid-fire reconnection on persistent errors


def vad_pipeline():
    pa = pyaudio.PyAudio()
    stream = pa.open(format=FORMAT, channels=CHANNELS, rate=RATE,
                     input=True, frames_per_buffer=CHUNK_SAMPLES)
    logger.info("Microphone stream opened successfully.")

    chunk_ms = (CHUNK_SAMPLES / RATE) * 1000.0
    silence_need = int(MIN_SILENCE_MS / chunk_ms)
    pre_pad_need = int(SPEECH_PAD_MS / chunk_ms)
    max_chunks   = int(MAX_SEGMENT_MS / chunk_ms)
    chunk_duration_chunks = int(CHUNK_DURATION_MS / chunk_ms)
    last_chunk_time = 0

    pre_pad = deque(maxlen=pre_pad_need)
    voiced_frames = []
    is_speaking = False
    silence_chunks = 0
    seg_chunks = 0
    speech_start_time = None
    chunk_start_time = None
    consecutive_errors = 0
    chunks_processed = 0
    speech_detected_count = 0

    while state.is_running:
        try:
            chunk_bytes = stream.read(CHUNK_SAMPLES, exception_on_overflow=False)
            np_chunk = np.frombuffer(chunk_bytes, dtype=np.int16)

            # Conditionally apply audio preprocessing
            if AUDIO_PROCESSING_AVAILABLE and (NOISE_REDUCTION_ENABLED or AUDIO_NORMALIZATION_ENABLED):
                np_chunk = preprocess_audio(np_chunk)

            tensor = torch.from_numpy(np_chunk.copy()).float() / 32768.0

            # Быстрый per-chunk score (см. пример "just probabilities" в wiki)
            try:
                prob = state.vad_model(tensor, RATE).item()
            except ValueError as e:
                if "too short" in str(e):
                    logger.debug("Skipping short audio chunk")
                    prob = 0.0  # Treat as silence to continue
                else:
                    raise e

            # Update metrics counters
            chunks_processed += 1
            if chunks_processed % 1000 == 0:  # каждые ~16 секунд
                logger.info(f"Processed {chunks_processed} chunks, detected {speech_detected_count} speech events")

            # Use StateManager
            if prob >= THRESH_SPEECH:
                state.state_manager.transition("speech_detected")
                speech_detected_count += 1

            if state.state_manager.current_state == VoiceState.SPEAKING and state.is_speaking:
                # Interrupt detection during TTS
                if prob > state.interrupt_threshold:
                    logger.info("Interrupt detected during speaking!")
                    state.state_manager.transition("interrupt_detected")
                    # Stop TTS via Redis
                    if state.redis_client:
                        try:
                            state.redis_client.publish("astra:tts_interrupt", "stop")
                        except redis.exceptions.ConnectionError as e:
                            logger.warning(f"Could not publish to Redis: {e}")
                    state.is_speaking = False
                    state.interrupt_active = True

            if is_speaking:
                voiced_frames.append(chunk_bytes)
                seg_chunks += 1
                if prob >= THRESH_SPEECH:
                    silence_chunks = 0
                    last_chunk_time = time.time()
                else:
                    # тихо
                    silence_chunks += 1
                    if silence_chunks >= silence_need or seg_chunks >= max_chunks:
                        state.state_manager.transition("processing_complete")
                        is_speaking = False
                        payload = b"".join(voiced_frames)
                        if speech_start_time:
                            vad_duration = (time.time() - speech_start_time) * 1000
                            logger.info(f"VAD processing duration: {vad_duration:.2f} ms for {len(payload)/1024:.2f} KB")
                            speech_start_time = None
                        voiced_frames.clear()  # Memory management
                        silence_chunks = 0
                        seg_chunks = 0
                        stt_send_time = time.time()
                        threading.Thread(target=send_to_stt, args=(payload,), daemon=True).start()
                        pre_pad.clear()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
            else:
                # пока молчим — накапливаем небольшой предбуфер
                pre_pad.append(chunk_bytes)
                if prob >= THRESH_SPEECH:
                    speech_start_time = time.time()
                    is_speaking = True
                    voiced_frames = list(pre_pad)
                    seg_chunks = len(voiced_frames)
                    silence_chunks = 0
                    chunk_start_time = time.time()

            # Streaming: Check if we need to send a chunk
            if state.streaming_active and is_speaking and chunk_start_time:
                current_time = time.time()
                time_since_chunk = (current_time - chunk_start_time) * 1000
                if time_since_chunk >= CHUNK_DURATION_MS:
                    if len(voiced_frames) > 0:
                        chunk_payload = b"".join(voiced_frames[-chunk_duration_chunks:])
                        logger.debug(f"Sending streaming chunk: {len(chunk_payload)/1024:.2f} KB")
                        # Put the chunk into the queue for the websocket_sender to process
                        state.main_loop.call_soon_threadsafe(state.audio_queue.put_nowait, chunk_payload)
                        # Keep recent chunks for continuity
                        voiced_frames = voiced_frames[-chunk_duration_chunks:]
                        chunk_start_time = current_time

            consecutive_errors = 0

        except Exception as e:
            consecutive_errors += 1
            logger.error(f"Error in VAD loop: {e}")
            if consecutive_errors > 10:
                logger.error("Too many consecutive errors, stopping pipeline")
                break
            time.sleep(0.1)  # небольшая пауза при ошибке

    stream.close()
    pa.terminate()
    logger.info("Audio stream closed.")


# --- API Endpoints ---
@app.post("/start", response_model=StatusResponse)
async def start_listening():
    if state.is_running:
        raise HTTPException(status_code=400, detail="Service is already running.")
    if not state.vad_model:
        raise HTTPException(status_code=503, detail="VAD model not loaded yet.")

    state.is_running = True
    state.streaming_active = STREAMING_ENABLED

    if state.streaming_active:
        logger.info("Starting VAD pipeline with streaming enabled.")
        state.audio_queue = asyncio.Queue()
        state.websocket_sender_task = asyncio.create_task(websocket_sender())
    else:
        logger.info("Starting VAD pipeline with batch mode.")

    state.audio_thread = threading.Thread(target=vad_pipeline, daemon=True)
    state.audio_thread.start()
    logger.info("VAD pipeline started.")
    return {"running": True, "streaming": state.streaming_active}

@app.websocket("/ws/voice")
async def websocket_voice(websocket: WebSocket):
    """WebSocket endpoint for real-time voice streaming"""
    await websocket.accept()
    state.active_websockets.add(websocket)
    logger.info(f"WebSocket connection established. Active connections: {len(state.active_websockets)}")
    
    try:
        while True:
            # Keep connection alive, send periodic status
            await websocket.send_json({"type": "status", "message": "Listening for speech...", "timestamp": time.time()})
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        state.active_websockets.remove(websocket)
        logger.info(f"WebSocket connection closed. Active connections: {len(state.active_websockets)}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        state.active_websockets.remove(websocket)


@app.post("/stop", response_model=StatusResponse)
async def stop_listening():
    if not state.is_running:
        raise HTTPException(status_code=400, detail="Service is not running.")
    
    logger.info("Stopping VAD pipeline...")
    state.is_running = False
    state.streaming_active = False

    # Stop the websocket sender task
    if state.websocket_sender_task:
        state.websocket_sender_task.cancel()
        try:
            await state.websocket_sender_task
        except asyncio.CancelledError:
            logger.info("WebSocket sender task cancelled.")
        state.websocket_sender_task = None
        state.audio_queue = None

    # Close all client-facing WebSocket connections
    for ws in list(state.active_websockets):
        try:
            await ws.close()
        except Exception:
            pass
    state.active_websockets.clear()

    if state.audio_thread:
        state.audio_thread.join(timeout=2.0)
    
    logger.info("VAD pipeline stopped.")
    return {"running": False}

@app.get("/status")
async def get_status():
    """Get current service status including metrics"""
    return {
        "running": state.is_running,
        "streaming_enabled": STREAMING_ENABLED,
        "active_connections": len(state.active_websockets),
        "vad_model_loaded": state.vad_model is not None,
        "chunk_duration_ms": CHUNK_DURATION_MS,
        "current_state": state.state_manager.current_state.value if hasattr(state, 'state_manager') else "unknown"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for Voice-In service."""
    vad_ready = state.vad_model is not None
    stt_ready = False

    # Check downstream STT service health
    try:
        # Derive health URL from STT_SERVICE_URL
        base_stt_url = urljoin(STT_SERVICE_URL, '.')
        health_url = urljoin(base_stt_url, 'health')
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
            response.raise_for_status()
            stt_status = response.json().get("status")
            if stt_status == "healthy":
                stt_ready = True
    except Exception as e:
        logger.warning(f"Downstream health check for stt-service failed: {e}")
        stt_ready = False

    # Determine overall health
    is_healthy = vad_ready and stt_ready
    response_status_code = 200 if is_healthy else 503

    return JSONResponse(
        status_code=response_status_code,
        content={
            "status": "healthy" if is_healthy else "unhealthy",
            "checks": {
                "vad_model_loaded": vad_ready,
                "redis_connected": state.redis_client is not None,
                "downstream_stt_service": "healthy" if stt_ready else "unhealthy"
            }
        }
    )

def validate_config():
    """Validate configuration parameters"""
    issues = []
    if CHUNK_SAMPLES < 160 or CHUNK_SAMPLES > 1024:
        issues.append(f"Invalid CHUNK_SAMPLES: {CHUNK_SAMPLES}")
    if MIN_SILENCE_MS < 200 or MIN_SILENCE_MS > 5000:
        issues.append(f"MIN_SILENCE_MS {MIN_SILENCE_MS} may cause issues")
    if issues:
        logger.warning(f"Configuration warnings: {'; '.join(issues)}")
    else:
        logger.info("Configuration validation passed")

async def run_calibration_async(model):
    """Async wrapper for VAD calibration"""
    try:
        await asyncio.sleep(1)  # Brief delay after startup
        calibrate_vad_thresholds(model)
    except Exception as e:
        logger.error(f"Async calibration failed: {e}")


def calibrate_vad_thresholds(model):
    """Capture 5s silence to calibrate noise floor and adjust thresholds"""
    global THRESH_SPEECH, THRESH_SILENCE
    
    try:
        pa = pyaudio.PyAudio()
        stream = pa.open(format=FORMAT, channels=CHANNELS, rate=RATE,
                         input=True, frames_per_buffer=CHUNK_SAMPLES)
        
        logger.info("Capturing 5s silence for calibration...")
        silence_samples = []
        for _ in range(int(RATE * 5 / CHUNK_SAMPLES)):
            chunk = stream.read(CHUNK_SAMPLES, exception_on_overflow=False)
            np_chunk = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
            silence_samples.append(np.mean(np.abs(np_chunk)))
        
        stream.stop_stream()
        stream.close()
        pa.terminate()
        
        noise_floor = np.mean(silence_samples)
        logger.info(f"Noise floor detected: {noise_floor:.4f}")
        
        # Adjust thresholds based on noise level
        if noise_floor > 0.05:  # Noisy environment
            THRESH_SPEECH = min(0.65, 0.55 + noise_floor * 0.3) # Start from default
            THRESH_SILENCE = max(0.30, 0.40 - noise_floor * 0.2) # Start from default
        else:  # Quiet environment - final tuning
            THRESH_SPEECH = max(0.48, 0.55 - 0.07)
            THRESH_SILENCE = min(0.50, 0.40 + 0.05)

        logger.info(f"Calibrated thresholds: Speech={THRESH_SPEECH:.3f}, Silence={THRESH_SILENCE:.3f}")
        
        # Save calibration to config for persistence
        config = {
            'thresh_speech': float(THRESH_SPEECH),
            'thresh_silence': float(THRESH_SILENCE),
            'noise_floor': float(noise_floor),
            'calibrated_at': time.time()
        }
        with open('vad_calibration.json', 'w') as f:
            import json
            json.dump(config, f)
            
    except Exception as e:
        logger.warning(f"VAD calibration failed: {e}. Using default thresholds.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7010)
