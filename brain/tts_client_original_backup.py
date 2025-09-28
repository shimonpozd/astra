"""
Оригинальная реализация TTS клиента
Это был отдельный модуль tts_client.py
"""

import os
import httpx
import json
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class TTSClient:
    """Клиент для Text-to-Speech сервиса"""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("TTS_SERVICE_URL", "http://localhost:7040")
        if self.base_url.endswith("/"):
            self.base_url = self.base_url.rstrip("/")

    async def text_to_speech(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        output_format: str = "wav"
    ) -> Optional[bytes]:
        """
        Конвертация текста в речь

        Args:
            text: Текст для озвучивания
            voice: Голос для озвучивания
            speed: Скорость речи (0.5-2.0)
            output_format: Формат аудио (wav, mp3, etc.)

        Returns:
            Байты аудио файла или None при ошибке
        """

        url = f"{self.base_url}/tts"

        payload = {
            "text": text,
            "voice": voice,
            "speed": speed,
            "format": output_format
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()

                # Проверка типа контента
                content_type = response.headers.get("content-type", "")
                if "audio" in content_type or output_format in content_type:
                    return response.content
                else:
                    logger.error(f"Unexpected content type: {content_type}")
                    return None

        except httpx.HTTPError as e:
            logger.error(f"TTS request failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in TTS: {e}")
            return None

    async def get_available_voices(self) -> Dict[str, Any]:
        """
        Получение списка доступных голосов

        Returns:
            Словарь с информацией о голосах
        """

        url = f"{self.base_url}/voices"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to get voices: {e}")
            return {"error": str(e)}
        except Exception as e:
            logger.error(f"Unexpected error getting voices: {e}")
            return {"error": str(e)}

    async def health_check(self) -> bool:
        """
        Проверка здоровья TTS сервиса

        Returns:
            True если сервис доступен
        """

        url = f"{self.base_url}/health"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                return response.status_code == 200
        except Exception:
            return False

# Глобальный экземпляр клиента
_tts_client = None

def get_tts_client() -> TTSClient:
    """
    Получение глобального экземпляра TTS клиента

    Returns:
        TTSClient instance
    """

    global _tts_client
    if _tts_client is None:
        _tts_client = TTSClient()
    return _tts_client

async def text_to_speech(
    text: str,
    voice: str = "default",
    speed: float = 1.0,
    output_format: str = "wav"
) -> Optional[bytes]:
    """
    Удобная функция для TTS

    Returns:
        Байты аудио или None
    """

    client = get_tts_client()
    return await client.text_to_speech(text, voice, speed, output_format)

async def get_available_voices() -> Dict[str, Any]:
    """
    Удобная функция для получения голосов

    Returns:
        Информация о доступных голосах
    """

    client = get_tts_client()
    return await client.get_available_voices()

# Кеширование для производительности
_audio_cache = {}

async def text_to_speech_cached(
    text: str,
    voice: str = "default",
    speed: float = 1.0
) -> Optional[bytes]:
    """
    TTS с кешированием

    Args:
        text: Текст для озвучивания
        voice: Голос
        speed: Скорость речи

    Returns:
        Байты аудио или None
    """

    cache_key = f"{voice}:{speed}:{hash(text)}"

    if cache_key in _audio_cache:
        return _audio_cache[cache_key]

    audio_data = await text_to_speech(text, voice, speed)

    if audio_data:
        _audio_cache[cache_key] = audio_data

        # Ограничение размера кеша
        if len(_audio_cache) > 100:
            # Очистка старых записей
            oldest_keys = sorted(_audio_cache.keys())[:20]
            for key in oldest_keys:
                del _audio_cache[key]

    return audio_data

# Поддержка различных TTS провайдеров
class XTTSClient(TTSClient):
    """Клиент для XTTS сервиса"""

    async def text_to_speech(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        language: str = "ru"
    ) -> Optional[bytes]:

        url = f"{self.base_url}/tts"

        payload = {
            "text": text,
            "voice": voice,
            "speed": speed,
            "language": language
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.content
        except Exception as e:
            logger.error(f"XTTS request failed: {e}")
            return None

class OpenAITTSClient:
    """Клиент для OpenAI TTS"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key is required")

    async def text_to_speech(
        self,
        text: str,
        voice: str = "alloy",
        model: str = "tts-1"
    ) -> Optional[bytes]:

        url = "https://api.openai.com/v1/audio/speech"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "wav"
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                return response.content
        except Exception as e:
            logger.error(f"OpenAI TTS request failed: {e}")
            return None

# Фабрика для создания клиентов различных провайдеров
def create_tts_client(provider: str = "default") -> TTSClient:
    """
    Создание TTS клиента для указанного провайдера

    Args:
        provider: Провайдер TTS ("default", "xtts", "openai")

    Returns:
        TTSClient instance
    """

    if provider == "xtts":
        return XTTSClient()
    elif provider == "openai":
        return OpenAITTSClient()
    else:
        return TTSClient()