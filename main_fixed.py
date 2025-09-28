
import logging
import os
import json
import wave
from io import BytesIO

import pyaudio
import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks
from openai import OpenAI
from pydantic import BaseModel

# --- Конфигурация ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

TTS_URL = os.getenv("XTTS_URL", "http://localhost:8010")

# --- Глобальное состояние ---
class ServiceState:
    def __init__(self):
        self.openai_client = None
        self.personalities = {}
        self.default_speaker = None

state = ServiceState()

# --- Модели данных ---
class ChatRequest(BaseModel):
    text: str
    personality_id: str = "default"

# --- FastAPI приложение ---
app = FastAPI(title="Brain Service", version="5.2.0")

@app.on_event("startup")
def startup_event():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    state.openai_client = OpenAI(api_key=api_key)
    logger.info("Клиент OpenAI инициализирован.")
    try:
        base_dir = os.path.dirname(__file__)
        with open(os.path.join(base_dir, "..", "personalities.json"), "r", encoding="utf-8") as f:
            state.personalities = json.load(f)
        logger.info(f"Загружено {len(state.personalities)} личностей.")
        with open(os.path.join(base_dir, "..", "default_speaker.json"), "r", encoding="utf-8") as f:
            state.default_speaker = json.load(f)
        logger.info("Голос по умолчанию загружен.")
    except Exception as e:
        raise RuntimeError(f"Could not load config files: {e}")

# --- Аудио: воспроизведение WAV ---
def play_wav_bytes(wav_bytes: bytes):
    """Проигрывает WAV-байты через PyAudio корректно (читая формат из заголовка)."""
    if not wav_bytes:
        logger.error("Пустые WAV-данные, воспроизведение невозможно.")
        return

    p = pyaudio.PyAudio()
    try:
        with wave.open(BytesIO(wav_bytes), 'rb') as wf:
            fmt = p.get_format_from_width(wf.getsampwidth())
            stream = p.open(format=fmt, channels=wf.getnchannels(), rate=wf.getframerate(), output=True)
            chunk = 4096
            data = wf.readframes(chunk)
            while data:
                stream.write(data)
                data = wf.readframes(chunk)
            stream.stop_stream()
            stream.close()
        logger.info("Воспроизведение завершено.")
    except Exception as e:
        logger.error(f"Ошибка воспроизведения WAV через PyAudio: {e}")
    finally:
        p.terminate()

# --- Основная логика ---
def process_request(request: ChatRequest):
    config = state.personalities.get(request.personality_id, {})
    language = config.get("language", "ru")
    speaker_from_cfg = config.get("speaker")

    logger.info(f"Новый запрос для '{request.personality_id}': '{request.text}'")

    # 1) LLM-ответ
    try:
        llm_response = state.openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": request.text}],
            temperature=0.7,
        )
        reply_text = llm_response.choices[0].message.content.strip()
        logger.info(f"LLM ответил: '{reply_text}'")
    except Exception as e:
        logger.error(f"Ошибка LLM: {e}")
        return

    if not reply_text:
        logger.warning("Пустой ответ LLM — отмена синтеза.")
        return

    # 2) XTTS: нестримовый синтез (WAV)
    try:
        logger.info("Запрос на синтез речи в XTTS (/tts_to_audio)...")
        payload = {
            "text": reply_text,
            "language": language,
        }

        # Варианты источника голоса:
        # - если в default_speaker заданы latents — используем их
        # - иначе, если указан speaker по имени — отправим его
        ds = state.default_speaker or {}
        if "speaker_embedding" in ds and "gpt_cond_latent" in ds:
            payload["speaker_embedding"] = ds["speaker_embedding"]
            payload["gpt_cond_latent"] = ds["gpt_cond_latent"]
        elif "speaker" in ds:
            payload["speaker"] = ds["speaker"]
        elif speaker_from_cfg:
            payload["speaker"] = speaker_from_cfg

        r = requests.post(f"{TTS_URL}/tts_to_audio", json=payload, timeout=120)
        r.raise_for_status()

        content_type = r.headers.get("content-type", "").lower()
        if "audio/wav" not in content_type and "application/octet-stream" not in content_type:
            logger.warning("Неожиданный Content-Type: %s (ожидали audio/wav).", content_type)

        play_wav_bytes(r.content)

    except Exception as e:
        logger.error(f"Ошибка TTS (/tts_to_audio): {e}")

# --- HTTP-обработчики ---
@app.post("/chat/voice")
async def chat_voice_handler(request: ChatRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_request, request)
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7030)
