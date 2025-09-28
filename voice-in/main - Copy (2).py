import logging
import threading
import wave
from io import BytesIO

import numpy as np
import pyaudio
import requests
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("voice-in-service")

app = FastAPI(title="Voice-In Service (Silero VAD)", version="2.5.0")

# --- VAD Settings (Tunable) ---
VAD_THRESHOLD = 0.2  # Sensitivity threshold. Lower = more sensitive.
MIN_SILENCE_MS = 3000  # Silence in ms to consider phrase ended.

# --- Audio Settings ---
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK_SAMPLES = 512  # Required chunk size for Silero VAD at 16kHz.

STT_SERVICE_URL = "http://localhost:7020/stt"


# --- Global State ---
class ServiceState:
    def __init__(self):
        self.is_running = False
        self.audio_thread = None
        self.vad_model = None
        self.vad_iterator = None


state = ServiceState()


# --- Data Models ---
class StatusResponse(BaseModel):
    running: bool


# --- VAD Initialization ---
@app.on_event("startup")
def load_model():
    logger.info("Loading Silero VAD model...")
    try:
        model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False
        )
        state.vad_model = model
        # get_speech_ts function is utils[3]
        state.vad_iterator = utils[3](model, threshold=VAD_THRESHOLD)
        logger.info("Silero VAD model loaded successfully.")
    except Exception as e:
        raise RuntimeError(f"Could not load Silero VAD model: {e}")


# --- Core Logic ---
def send_to_stt(audio_data: bytes):
    logger.info(f"Phrase detected, {len(audio_data) / 1024:.2f} KB. Sending to STT...")
    try:
        # Package as WAV in memory
        with BytesIO() as wav_io:
            with wave.open(wav_io, "wb") as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(pyaudio.get_sample_size(FORMAT))
                wf.setframerate(RATE)
                wf.writeframes(audio_data)
            wav_bytes = wav_io.getvalue()

        # Send as hex string to avoid JSON byte issues
        response = requests.post(
            STT_SERVICE_URL,
            json={"audio_data": wav_bytes.hex()},
            timeout=10.0
        )
        response.raise_for_status()
        logger.info("Audio successfully sent to STT.")
    except Exception as e:
        logger.error(f"Error sending audio to STT service: {e}")


def vad_pipeline():
    pa = pyaudio.PyAudio()
    stream = pa.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK_SAMPLES
    )
    logger.info("Microphone stream opened successfully.")

    voiced_frames = []
    is_speaking = False
    silence_chunks = 0
    chunk_duration_ms = (CHUNK_SAMPLES / RATE) * 1000
    silence_timeout_chunks = MIN_SILENCE_MS / chunk_duration_ms

    while state.is_running:
        try:
            chunk_bytes = stream.read(CHUNK_SAMPLES)
            numpy_chunk = np.frombuffer(chunk_bytes, dtype=np.int16)
            tensor_chunk = torch.from_numpy(numpy_chunk.copy()).float() / 32768.0

            speech_dict = state.vad_iterator(tensor_chunk, return_seconds=True)

            if speech_dict and "start" in speech_dict:
                if not is_speaking:
                    logger.info("VAD: Speech start detected.")
                    is_speaking = True
                    voiced_frames = [chunk_bytes]  # Start new recording
                silence_chunks = 0  # Reset silence counter
                voiced_frames.append(chunk_bytes)

            elif is_speaking:
                # Still speaking but chunk is silent
                voiced_frames.append(chunk_bytes)
                silence_chunks += 1
                if silence_chunks > silence_timeout_chunks:
                    is_speaking = False
                    logger.info("VAD: Speech end detected due to silence timeout.")
                    threading.Thread(
                        target=send_to_stt,
                        args=(b"".join(voiced_frames),),
                        daemon=True
                    ).start()

        except Exception as e:
            logger.error(f"Error in VAD loop: {e}")
            break

    state.vad_iterator.reset_states()
    stream.close()
    pa.terminate()
    logger.info("Audio stream closed.")


# --- API Endpoints ---
@app.post("/start", response_model=StatusResponse)
def start_listening():
    if state.is_running:
        raise HTTPException(status_code=400, detail="Service is already running.")
    if not state.vad_model:
        raise HTTPException(status_code=503, detail="VAD model not loaded yet.")
    state.is_running = True
    state.audio_thread = threading.Thread(target=vad_pipeline, daemon=True)
    state.audio_thread.start()
    logger.info("VAD pipeline started.")
    return {"running": True}


@app.post("/stop", response_model=StatusResponse)
def stop_listening():
    if not state.is_running:
        raise HTTPException(status_code=400, detail="Service is not running.")
    state.is_running = False
    if state.audio_thread:
        state.audio_thread.join(timeout=2.0)
    logger.info("VAD pipeline stopped.")
    return {"running": False}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7010)
