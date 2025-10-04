import os
import asyncio
import aiohttp
import logging
import re
import uuid
from typing import Optional, List, AsyncGenerator, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("brain.tts")


class TTSMode(Enum):
    DISABLED = "disabled"
    SIMPLE = "simple"
    STREAMING = "streaming"


@dataclass
class TTSConfig:
    service_url: str = "http://localhost:7040"
    mode: TTSMode = TTSMode.STREAMING
    timeout: int = 5
    retry_attempts: int = 2
    min_sentence_length: int = 3
    max_sentence_length: int = 500


class SmartSentenceSplitter:
    """Sentence splitter tuned for Russian punctuation and abbreviations."""

    def __init__(self, min_len: int, max_len: int):
        self.min_len = min_len
        self.max_len = max_len
        self.sentence_endings = re.compile(r"[.!?…]+")
        self.terminator_chars = {".", "!", "?", "…"}
        # Stored with unicode escapes to keep the file ASCII-only.
        self.abbreviations = {
            "\u0433.", "\u0433\u0433.", "\u0432.", "\u0432\u0432.", "\u0440.", "\u0440\u0443\u0431.", "\u043a\u043e\u043f.", "\u0441\u0442\u0440.",
            "\u0442.\u0435.", "\u0438.\u0442.\u0434.", "\u0438.\u0442.\u043f.", "\u0442.\u043a.", "\u0442.\u043f.", "\u0442.\u043d.", "\u0442.\u043e.",
            "\u0434\u0440.", "\u043f\u0440\u043e\u0444.", "\u0430\u043a\u0430\u0434.", "\u0434-\u0440"
        }

    @staticmethod
    def _last_token(text: str) -> Optional[str]:
        stripped = text.rstrip()
        if not stripped:
            return None
        tokens = stripped.split()
        if not tokens:
            return None
        return tokens[-1]

    def split(self, text: str) -> List[str]:
        if not text:
            return []

        sentences: List[str] = []
        start = 0
        for match in self.sentence_endings.finditer(text):
            end = match.end()
            candidate = text[start:end].strip()
            if not candidate:
                start = end
                continue

            last_token = self._last_token(candidate)
            if last_token and last_token.lower() in self.abbreviations:
                # Keep accumulating until we hit the real sentence ending.
                continue

            if self.min_len <= len(candidate) <= self.max_len:
                sentences.append(candidate)
            elif len(candidate) > self.max_len:
                sentences.append(candidate)
            start = end

        remainder = text[start:].strip()
        if remainder:
            sentences.append(remainder)

        return sentences


class TTSClient:
    def __init__(self, config: TTSConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.splitter = SmartSentenceSplitter(config.min_sentence_length, config.max_sentence_length)
        self.current_stream_id: Optional[str] = None
        self.is_service_available = True

    async def _ensure_session(self) -> None:
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout)
            self.session = aiohttp.ClientSession(timeout=timeout)

    async def close(self) -> None:
        if self.session:
            await self.session.close()
            self.session = None

    async def _check_service_health(self) -> bool:
        try:
            await self._ensure_session()
            url = f"{self.config.service_url.rstrip('/')}/status"
            async with self.session.get(url) as response:
                if response.status == 200:
                    self.is_service_available = True
                    return True
                if response.status == 404:
                    # Status endpoint is optional; assume the service is up.
                    logger.debug("TTS status endpoint not found at %s", url)
                    self.is_service_available = True
                    return True
                logger.warning("TTS service health check returned %s", response.status)
        except Exception as exc:
            logger.warning("TTS service health check failed: %s", exc)
            self.is_service_available = False
            return False
        return False

    async def _send_with_retry(self, endpoint: str, payload: dict, *, mark_unavailable_on_failure: bool = True) -> bool:
        if not self.is_service_available:
            return False

        url = f"{self.config.service_url.rstrip('/')}/{endpoint.lstrip('/')}"
        attempts = max(1, self.config.retry_attempts)

        for attempt in range(1, attempts + 1):
            try:
                await self._ensure_session()
                async with self.session.post(url, json=payload) as response:
                    if response.status == 200:
                        if not self.is_service_available:
                            self.is_service_available = True
                        return True
                    if response.status == 404:
                        logger.debug("TTS endpoint %s not found (404)", endpoint)
                        if not mark_unavailable_on_failure:
                            return False
                    logger.warning("TTS request to %s failed with status %s (attempt %s)", endpoint, response.status, attempt)
            except asyncio.TimeoutError:
                logger.warning("TTS request to %s timed out (attempt %s)", endpoint, attempt)
            except Exception as exc:
                logger.warning("TTS request to %s raised %s (attempt %s)", endpoint, exc, attempt)

            await asyncio.sleep(0.1 * attempt)

        if mark_unavailable_on_failure:
            self.is_service_available = False
        return False

    async def speak_sentence(self, text: str, language: str = "ru") -> bool:
        if self.config.mode == TTSMode.DISABLED:
            return True
        if not text.strip():
            return True
        payload = {"text": text.strip(), "language": language}
        return await self._send_with_retry("speak", payload)

    async def start_streaming(self) -> str:
        self.current_stream_id = str(uuid.uuid4())
        return self.current_stream_id

    async def speak_streaming(self, text: str, is_final: bool = False, language: str = "ru") -> bool:
        if self.config.mode == TTSMode.DISABLED:
            return True
        if not text.strip() and not is_final:
            return True

        if not self.current_stream_id:
            await self.start_streaming()

        payload = {
            "text": text.strip(),
            "language": language,
            "stream_id": self.current_stream_id,
            "is_final": is_final
        }
        # Streaming endpoint is optional; gracefully fall back to simple mode on 404.
        ok = await self._send_with_retry("speak_streaming", payload, mark_unavailable_on_failure=False)
        if ok:
            return True

        fallback_payload = {"text": text.strip(), "language": language}
        return await self._send_with_retry("speak", fallback_payload)

    async def stop_all(self) -> bool:
        success = await self._send_with_retry("stop", {}, mark_unavailable_on_failure=False)
        self.current_stream_id = None
        return success

    async def get_audio_stream(self, text: str, language: str = "ru") -> AsyncGenerator[bytes, None]:
        """
        Requests TTS from the dispatcher and streams back the audio data.
        """
        if self.config.mode == TTSMode.DISABLED or not self.is_service_available:
            logger.info("TTS is disabled or service is unavailable, skipping audio stream.")
            return

        url = f"{self.config.service_url.rstrip('/')}/stream"
        payload = {"text": text.strip(), "language": language}
        
        try:
            await self._ensure_session()
            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    async for chunk in response.content.iter_any():
                        yield chunk
                else:
                    logger.error(
                        "TTS stream request to %s failed with status %s",
                        url,
                        response.status,
                    )
                    return
        except Exception as e:
            logger.error("Exception during TTS audio streaming: %s", e, exc_info=True)
            return

    def _extract_sentences(self, buffer: str) -> Tuple[List[str], str]:
        sentences = self.splitter.split(buffer)
        if not sentences:
            return [], buffer

        trimmed_buffer = buffer.rstrip()
        if trimmed_buffer and trimmed_buffer[-1] in self.splitter.terminator_chars:
            return sentences, ""

        if len(sentences) == 1:
            return [], sentences[0]

        return sentences[:-1], sentences[-1]

    def process_llm_stream(self, text_stream: AsyncGenerator[str, None], language: str = "ru") -> Tuple[AsyncGenerator[str, None], List[str]]:
        processed_sentences: List[str] = []

        async def stream_wrapper() -> AsyncGenerator[str, None]:
            sentence_buffer = ""

            if self.config.mode == TTSMode.STREAMING and self.is_service_available:
                await self.start_streaming()

            async for chunk in text_stream:
                if chunk is None:
                    continue

                yield chunk

                if self.config.mode == TTSMode.DISABLED or not self.is_service_available:
                    continue

                sentence_buffer += chunk
                complete, sentence_buffer = self._extract_sentences(sentence_buffer)

                for sentence in complete:
                    processed_sentences.append(sentence)
                    if self.config.mode == TTSMode.SIMPLE:
                        await self.speak_sentence(sentence, language)
                    elif self.config.mode == TTSMode.STREAMING:
                        await self.speak_streaming(sentence, False, language)

            if self.config.mode == TTSMode.DISABLED or not self.is_service_available:
                return

            final_sentence = sentence_buffer.strip()
            if final_sentence:
                processed_sentences.append(final_sentence)
                if self.config.mode == TTSMode.SIMPLE:
                    await self.speak_sentence(final_sentence, language)
                elif self.config.mode == TTSMode.STREAMING:
                    await self.speak_streaming(final_sentence, True, language)
            elif self.config.mode == TTSMode.STREAMING and self.current_stream_id:
                await self.speak_streaming("", True, language)

            self.current_stream_id = None

        return stream_wrapper(), processed_sentences


_tts_client: Optional[TTSClient] = None


def get_tts_client() -> TTSClient:
    global _tts_client
    if _tts_client is None:
        config = TTSConfig(
            service_url=os.getenv("TTS_SERVICE_URL", "http://localhost:7040"),
            mode=TTSMode(os.getenv("TTS_MODE", "streaming")),
            timeout=int(os.getenv("TTS_TIMEOUT", "5")),
            retry_attempts=int(os.getenv("TTS_RETRY_ATTEMPTS", "2")),
            min_sentence_length=int(os.getenv("TTS_MIN_SENTENCE_LENGTH", "3")),
            max_sentence_length=int(os.getenv("TTS_MAX_SENTENCE_LENGTH", "500"))
        )
        _tts_client = TTSClient(config)
    return _tts_client


async def send_to_tts(text: str, language: str = "ru") -> bool:
    return await get_tts_client().speak_sentence(text, language)
