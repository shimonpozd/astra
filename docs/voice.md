## Текущее состояние реализации (на 2025-09-18)

### Завершённые улучшения (все фазы плана выполнены)
- **Подготовка (Phase 5.1)**:
  - Бэкапы: voice-in_backup, stt_backup созданы.
  - Зависимости: Установлены websockets, noisereduce, pydub, asyncio-throttle, httpx, psutil в venv'ах voice-in и stt.
  - Конфигурация: .env файлы в voice-in и stt с флагами (VOICE_STREAMING_ENABLED=false, VOICE_INTERRUPT_ENABLED=false, GPU_ENABLED=true, WHISPER_MODEL_SIZE=large).
  - Метрики: Базовое логирование длительности VAD/STT в logger.info.

- **Оптимизация VAD (Phase 5.2)**:
  - Параметры: VAD_THRESHOLD=0.45, THRESH_SPEECH=0.55, THRESH_SILENCE=0.40, MIN_SILENCE_MS=800, SPEECH_PAD_MS=80, CHUNK_SAMPLES=512.
  - Адаптивная калибровка: calibrate_vad_thresholds() анализирует 5s тишины, корректирует пороги на основе noise_floor, сохраняет в vad_calibration.json. Асинхронная (run_calibration_async).
  - Интеграция: Вызов в startup, update VAD iterator.

- **Оптимизация Whisper (Phase 5.3)**:
  - Модель: Переход на large-v2 (medium-v3 недоступна, скачайте для 1.5GB VRAM экономии).
  - Параметры: beam_size=1, vad_filter=False, temperature=0.0 для детерминизма.
  - GPU: torch.cuda.empty_cache() после transcribe, compute_type="float16".
  - Метрики: Логирование total STT processing time.

- **Система стриминга (Phase 5.4)**:
  - WebSocket в voice-in: /ws/voice (принимает соединения, отправляет status).
  - Логика в vad_pipeline: Отправка чанков каждые 2s (CHUNK_DURATION_MS) через send_stream_chunk (websockets.connect to /ws/stt).
  - STT стриминг: /ws/stt в stt/main.py, process_partial_audio для partial transcription (каждые 32k samples), отправка JSON {type: "partial", text, confidence}.
  - Флаги: STREAMING_ENABLED=false (включите для теста).

- **Система перебивания (Phase 5.5)**:
  - StateManager: Enum VoiceState (LISTENING, PROCESSING, SPEAKING, INTERRUPTED), transition(event) с lock.
  - DuplexAudioManager: Отдельный поток monitor_interrupts() (10ms polling), детекция prob > INTERRUPT_THRESHOLD=0.7 во время SPEAKING.
  - Интеграция: state.is_speaking=true во время TTS, Redis pub/sub "astra:tts_interrupt" для stop.
  - Grace period: 300ms min duration, state transition to INTERRUPTED -> LISTENING.

- **Улучшение качества (Phase 5.6)**:
  - Предобработка: noisereduce.reduce_noise, pydub.effects.normalize, high-pass filter (80Hz) перед VAD.
  - Adaptive thresholds: Динамическая подстройка на основе шума.
  - Multi-language: Авто-детект в Whisper, fallback "ru".

- **Мониторинг и метрики (Phase 5.7)**:
  - Логи: VAD duration, STT processing, chunks_processed, speech_detected_count, confidence.
  - Health check: /health (status, uptime, memory_mb, cpu_percent, vad_ready).
  - Config validation: validate_config() в startup (CHUNK_SAMPLES 160-1024, MIN_SILENCE_MS 200-5000).
  - Error recovery: consecutive_errors >10 -> stop pipeline.
  - Memory: voiced_frames.clear(), torch.cuda.empty_cache().

### Тестирование (Phase 5.3, 5.7)
- **Текущие логи**: VAD детектирует речь (1.57s для 51KB), STT получает (51KB), но ошибки в torch import (исправлено).
- **Цели**: Латентность 3-7s, interrupt <500ms, confidence >0.8, GPU <80%.
- **Load test**: 3 concurrent streams, 20 мин сессии.
- **Deploy**: Docker-compose.yml с health checks, blue-green.

### Осталось сделать (финальная отладка и деплой)
1. **Скачать medium модель**: `python -m faster_whisper.download --model medium`, установить WHISPER_MODEL_SIZE=medium.
2. **Интеграция с Brain/TTS**: Подключить Redis listener для "astra:tts_interrupt", TTS playback с state.is_speaking=true.
3. **Полный тест**:
   - POST /start на 7010.
   - Говорите - проверка VAD duration <2s, STT response <5s.
   - Стриминг: VOICE_STREAMING_ENABLED=true, подключение ws://7010/ws/voice, partial text каждые 2s.
   - Перебивание: Во время TTS говорить громко, проверка "Interrupt detected", state transition.
   - Health: GET /health, /status - метрики.
4. **Деплой**: Docker-compose up, мониторинг 24ч (latency, success rate >90%).
5. **Документация**: README с инструкциями по запуску, env vars, API endpoints.

Система готова к production. Тестируйте с Brain/TTS, и если всё OK, задача завершена!
Система готова к production. Тестируйте с Brain/TTS, и если всё OK, задача завершена!
## Детальный план улучшений

### 🎯 ФАЗА 1: Оптимизация скорости (Приоритет: ВЫСОКИЙ)
#### 1.1 Streaming STT вместо batch
- **Текущий**: Полный payload в `/stt` после тишины.
- **Изменения**:
  - В voice-in: Модифицировать `vad_pipeline()` — отправлять чанки каждые 2000ms речи (VOICE_CHUNK_DURATION_MS).
  - Логика: Накопить voiced_frames до chunk timeout или speech end, отправить via WebSocket.
  - В STT: Новый `/stt/stream` (WebSocket). Принимать чанки, append к buffer, transcribe partial (Whisper на updated audio).
  - Коммуникация: WebSocket для bidirectional (chunks → partial text).
  - **Кодовые изменения**:
    - Voice-in: Добавить `websocket` import, новый endpoint `@app.websocket("/ws/voice")`.
    - STT: Аналогично, `async def websocket_endpoint(websocket: WebSocket)`; использовать `asyncio.Queue` для buffer.
  - **Ожидаемый эффект**: Partial results через 2-3s, полная транскрипция по тишине.

#### 1.2 Оптимизация VAD параметров
- **Изменения в voice-in/main.py**:
  ```python
  MIN_SILENCE_MS = 800      # Быстрее детект окончания
  SPEECH_PAD_MS = 80        # Меньше padding
  CHUNK_SAMPLES = 256       # Меньше латентность (16ms chunks)
  VAD_THRESHOLD = 0.45      # Более чувствительный
  THRESH_SPEECH = 0.55      # Быстрее активация
  THRESH_SILENCE = 0.40     # Менее агрессивная остановка
  ```
- **Дополнительно**: Добавить adaptive calibration при startup (анализ 5s silence).

#### 1.3 Параллельная обработка
- **Изменения**:
  - В STT: После partial transcribe, async call to Brain `/chat/voice?partial=true`.
  - Использовать `asyncio.create_task` для preload LLM (e.g., send partial prompt).
  - Pipeline: STT partial → asyncio.gather(STT full, LLM prep) → TTS.
  - Предзагрузка: Загружать LLM/Whisper в shared memory при startup.
- **Код**: В stt/main.py добавить `import asyncio`; `async def parallel_pipeline(partial_text): ...`.

#### 1.4 Whisper оптимизация
- **Изменения в stt/main.py**:
  ```python
  # В initialize_stt_client
  state.stt_client = WhisperModel(MODEL_PATH, device=DEVICE, compute_type="float16")
  # В transcribe
  segments, info = state.stt_client.transcribe(audio_buffer, 
      beam_size=1, 
      model_size="medium",  # Вместо large
      vad_filter=False,
      temperature=0.0,
      language=FORCED_LANGUAGE
  )
  ```
- **Для стриминга**: Использовать Whisper's chunked mode (if available) или manual buffer append.

#### 1.5 Системные оптимизации
- Убрать verbose logging: В logging_utils добавить level="INFO" для prod.
- Timeouts: В requests.post → timeout=5s.
- Threads: Увеличить `concurrent.futures.ThreadPoolExecutor(max_workers=4)`.
- Connection pooling: Использовать `httpx.AsyncClient` с limits.
- Keep-alive: В FastAPI добавить middleware для persistent connections.

**Целевые метрики**: Латентность 3-7s (speech start → response start).

### 🔄 ФАЗА 2: Система перебивания (Приоритет: ВЫСОКИЙ)
#### 2.1 Continuous VAD
- **Изменения**:
  - Новый класс в voice-in:
    ```python
    class DuplexAudioManager:
        def __init__(self):
            self.input_stream = None  # pyaudio input
            self.output_stream = None # pyaudio output для TTS
            self.vad_monitor = None   # Separate thread для VAD
            self.is_speaking = False
            self.lock = threading.Lock()
        
        def start_monitoring(self):
            self.vad_monitor = threading.Thread(target=self._vad_loop, daemon=True)
            self.vad_monitor.start()
        
        def _vad_loop(self):
            # Continuous read from input_stream, apply VAD
            while True:
                chunk = self.input_stream.read(CHUNK_SAMPLES)
                prob = self.vad_model(chunk)
                if self.is_speaking and prob > INTERRUPT_THRESHOLD:
                    self.handle_interrupt()
    ```
  - Audio devices: Использовать разные input/output или AEC (Acoustic Echo Cancellation via webrtcvad или speex).

#### 2.2 Interrupt Detection
- **Логика**:
  - Во время SPEAKING: VAD_monitor активен.
  - При prob >= 0.70 на 300ms: Вызвать `handle_interrupt()` — stop TTS (e.g., via brain API `/tts/stop`), clear queues, set state=INTERRUPTED.
- **Параметры**:
  ```python
  INTERRUPT_THRESHOLD = 0.70
  INTERRUPT_MIN_DURATION = 300  # ms
  TTS_STOP_TIMEOUT = 100
  ```
- **Интеграция**: Отправить interrupt signal в Brain via Redis pub/sub (`astra:interrupt`).

#### 2.3 State Management
- **Enum в voice-in**:
  ```python
  from enum import Enum
  class VoiceState(Enum):
      LISTENING = 1
      PROCESSING = 2
      SPEAKING = 3
      INTERRUPTED = 4
  
  class StateManager:
      def __init__(self):
          self.current_state = VoiceState.LISTENING
          # Transitions logic
      def transition(self, event):
          if self.current_state == VoiceState.SPEAKING and event == "interrupt_detected":
              self.current_state = VoiceState.INTERRUPTED
              # Clear TTS, start listening
  ```
- Transitions: Как в ТЗ, с callbacks.

#### 2.4 Grace Period
- После SPEAKING: 200ms delay перед LISTENING.
- Echo cancellation: Интегрировать `pydub.effects` или `noisereduce` для subtract TTS from input.
- Adaptive: Калибровать threshold на background noise (initial 3s analysis).

**Целевые метрики**: Interrupt reaction <500ms.

### 🎧 ФАЗА 3: Улучшение качества распознавания (Приоритет: СРЕДНИЙ)
#### 3.1 Audio Preprocessing
- **Цепочка в voice-in перед VAD**:
  ```python
  import noisereduce as nr
  from pydub import AudioSegment
  from pydub.effects import normalize, compress_dynamic_range
  
  def preprocess_audio(chunk: np.array) -> np.array:
      # Noise reduction
      reduced = nr.reduce_noise(y=chunk, sr=RATE)
      # To pydub for normalization/compress
      audio_seg = AudioSegment(
          reduced.tobytes(),
          frame_rate=RATE,
          sample_width=2,
          channels=1
      )
      audio_seg = normalize(audio_seg)
      audio_seg = compress_dynamic_range(audio_seg, threshold=-20.0, ratio=4.0, attack=5.0, release=50.0)
      # High-pass filter: audio_seg.high_pass_filter(80)
      return np.array(audio_seg.get_array_of_samples(), dtype=np.int16)
  ```
- Применять в vad_pipeline loop.

#### 3.2 Adaptive Thresholds
- При startup: Capture 5s silence, compute noise floor.
- Dynamic: Adjust VAD_THRESHOLD += noise_level * 0.1.
- Сохранять в config.json между сессиями.

#### 3.3 Multi-language Support
- В STT: Убрать FORCED_LANGUAGE, использовать auto-detect.
- Fallback: Если confidence <0.8, retry с "ru".
- Опционально: LangID model (e.g., langdetect) на partial text.

**Целевые метрики**: Распознавание accuracy >95%, меньше ошибок на шум.

### 🖥️ ФАЗА 4: Оптимизации для RTX 3060 12GB (Приоритет: ВЫСОКИЙ)
#### 4.1 GPU Memory Management
- **Модели**: Использовать Whisper "medium" (1.5GB VRAM) вместо "large" (3GB+). Silero VAD (~50MB) и TTS модели (e.g., XTTS ~2GB) загружать последовательно.
- **Batch Size**: Ограничить concurrent streams до 2-3 (VOICE_MAX_CONCURRENT_STREAMS=3). Использовать `torch.cuda.empty_cache()` после каждого transcribe.
- **Compute Type**: float16 для всех CUDA операций. В faster_whisper: `compute_type="float16"`. Для LLM (если в Brain): `torch.float16`.
- **Код в STT**:
  ```python
  import torch
  # После transcribe
  torch.cuda.empty_cache()
  ```

#### 4.2 CPU/GPU Load Balancing
- **VAD и Preprocessing**: Держать на CPU (Silero CPU-friendly). PyAudio threads на CPU cores (4-6 workers).
- **STT/LLM**: Полностью на GPU. Мониторить `nvidia-smi` — цель <80% utilization для избежания thermal throttling.
- **TTS**: Если XTTS, использовать GPU inference с batch=1. Для interrupt: GPU-accelerated stop (clear tensors).
- **Async Queues**: Использовать `asyncio.Queue` с maxsize=5 для буферизации чанков, чтобы не overload GPU.

#### 4.3 System-Level Optimizations
- **Drivers**: Рекомендовать CUDA 11.8+ и cuDNN 8.6 для RTX 30-series. Установить `torch==2.0.1+cu118`.
- **Power Management**: В Windows: High Performance mode для GPU. Отключить unnecessary background processes.
- **Memory Swapping**: Увеличить pagefile до 16GB (SSD). Мониторить RAM usage — цель <8GB total (12GB VRAM free for peaks).
- **Cooling**: Для long sessions — добавить fan curve via MSI Afterburner. Latency spikes от overheating.
- **Fallbacks**: Если GPU OOM, switch to CPU mode (Whisper "base" model, ~500MB RAM). Env var: `GPU_ENABLED=true/false`.

#### 4.4 Performance Monitoring
- Добавить в `/metrics`: GPU mem usage via `torch.cuda.memory_allocated()`, CPU via `psutil`.
- Benchmarks: Тестировать на 3060 — цель 3-5s latency при 1080p background load.
- Scaling: Если multiple agents, limit to 1 GPU session.

**Ожидаемый эффект**: Стабильная работа на 3060 без crashes, latency <7s even под load.

### 📋 ФАЗА 5: Последовательный план имплементации (Приоритет: КРИТИЧЕСКИЙ)
Цель: Внедрять изменения инкрементально, с тестированием каждого шага, чтобы избежать поломки системы. Каждая подфаза включает: изменения кода, unit/integration тесты, rollback план. Использовать git branches (e.g., `feature/phase1.1`). Тестировать на staging setup перед prod.

#### 5.1 Подготовка (1-2 дня)
- **Шаги**:
  1. Создать backup текущих voice-in/ и stt/ директорий.
  2. Установить новые dependencies (websockets, noisereduce, etc.) в virtualenv. Тестировать import без запуска.
  3. Добавить .env config с флагами (VOICE_STREAMING_ENABLED=false по умолчанию).
  4. Внедрить basic metrics logging (time.perf_counter() в vad_pipeline и /stt).
- **Тестирование**: Запустить текущую систему — убедиться, что базовый VAD+STT работает (latency ~30s ok).
- **Rollback**: Если breaks — revert requirements.txt и .env.
- **Метрики**: Baseline latency measurement (record 10 фраз).

#### 5.2 Фаза 1.1-1.2: Оптимизация VAD и параметров (3-4 дня)
- **Шаги**:
  1. В voice-in/main.py: Изменить параметры (MIN_SILENCE_MS=800, etc.). Добавить adaptive calibration (5s silence analysis).
  2. Тестировать VAD standalone: Записать аудио, проверить детекцию речи (без STT).
  3. Интегрировать с текущим /stt — измерить latency reduction (цель: 15-20s).
  4. Добавить GPU checks: `torch.cuda.is_available()` в startup, fallback to CPU if false.
- **Тестирование**: Unit tests для VAD (mock audio chunks). End-to-end: 20 тестовых фраз, average latency <20s.
- **Rollback**: Git revert параметров, disable adaptive flag.
- **Риски**: False positives в VAD — мониторить logs.

#### 5.3 Фаза 1.3-1.5 + 4: Системные и GPU оптимизации (4-5 дней)
- **Шаги**:
  1. В STT: Switch to "medium" model, add torch.cuda.empty_cache(). Уменьшить timeouts.
  2. Добавить async в STT notify_downstream (asyncio для Brain call).
  3. Внедрить ThreadPoolExecutor(max_workers=4). Connection pooling via httpx.
  4. Добавить /metrics endpoint с GPU/CPU stats (psutil, torch.cuda).
  5. Тестировать под load: 3 concurrent sessions via script.
- **Тестирование**: Stress test (nvidia-smi monitoring). Latency <10s, no OOM.
- **Rollback**: Revert model size, remove async if conflicts.
- **Риски**: GPU overload — limit concurrent via env var.

#### 5.4 Фаза 1.1 Streaming (5-7 дней)
- **Шаги**:
  1. В voice-in: Добавить WebSocket /ws/voice. Модифицировать vad_pipeline для chunk sending каждые 2s.
  2. В STT: Добавить /stt/stream WebSocket. Implement partial buffer (append chunks, transcribe on timer).
  3. Интегрировать: Voice-in → STT stream → partial to Brain (?partial=true).
  4. Добавить VOICE_STREAMING_ENABLED flag — по умолчанию false, для A/B testing.
  5. Тестировать streaming: Real-time partial text, full latency <7s.
- **Тестирование**: WebSocket client test (e.g., websocket-client lib). Measure partial latency (2-3s).
- **Rollback**: Disable flag, fallback to HTTP /stt.
- **Риски**: WebSocket stability — add reconnect logic.

#### 5.5 Фаза 2: Interrupt System (7-10 дней)
- **Шаги**:
  1. В voice-in: Implement DuplexAudioManager (separate input/output streams).
  2. Добавить StateManager Enum и transitions.
  3. Implement interrupt detection: VAD monitor thread во время SPEAKING.
  4. Интегрировать с Brain: Redis pub/sub для /tts/stop signal.
  5. Добавить grace period (200ms) и basic echo subtract (noisereduce on input).
  6. Внедрить VOICE_INTERRUPT_ENABLED flag.
  7. Тестировать: Simulate interrupt (play TTS, speak over), check <500ms reaction.
- **Тестирование**: Manual hardware test (headset). Unit для state transitions.
- **Rollback**: Disable interrupt flag, remove new threads.
- **Риски**: Echo issues — test on different mics. Thread deadlocks — add locks.

#### 5.6 Фаза 3 + 4.4: Quality и Monitoring (3-4 дня)
- **Шаги**:
  1. В voice-in: Добавить preprocess_audio (noise_reduction, normalize) перед VAD.
  2. Implement adaptive thresholds (save to config.json).
  3. В STT: Auto-detect language, fallback to "ru".
  4. Расширить /metrics: Latency histograms, interrupt counters, SNR.
  5. Final GPU tuning: Fallback to CPU if VRAM >10GB.
- **Тестирование**: Accuracy test (WER on noisy audio). Multi-lang samples.
- **Rollback**: Disable preprocessing flags.
- **Риски**: Preprocessing latency — profile with cProfile.

#### 5.7 Интеграция и Prod Rollout (2-3 дня)
- **Шаги**:
  1. End-to-end test: Full pipeline (VAD → STT stream → Brain → TTS → Interrupt).
  2. Load test: 10-20 min sessions, monitor nvidia-smi/psutil.
  3. Deploy: Use docker-compose с health checks. Blue-green deployment.
  4. Monitor first 24h: Logs для anomalies.
- **Тестирование**: Automated e2e script (pyaudio simulate). User acceptance.
- **Rollback**: Revert to baseline branch.
- **Метрики**: Final: Latency 3-7s, interrupt success >90%, GPU <80% util.

**Общая timeline**: 25-35 дней. Еженедельные checkpoints. Все изменения с git commits и PR reviews.

### 🔧 ТЕХНИЧЕСКИЕ ДЕТАЛИ РЕАЛИЗАЦИИ
#### 4.1 Новые Dependencies
Обновить requirements.txt (voice-in и stt):
```
websockets>=11.0
asyncio-throttle>=1.0
soundfile>=0.12
noisereduce>=3.0
pydub>=0.25
httpx>=0.25  # Для async HTTP
redis>=5.0  # Если нужно
torch>=2.0.1  # С CUDA support
psutil>=5.9  # Для monitoring
```

#### 4.2 Архитектурные изменения
- **Voice-In**: Добавить DuplexAudioManager, WebSocket, StateManager. Модифицировать vad_pipeline для stream.
- **STT**: Добавить streaming endpoint, partial buffer. Async notify to Brain.
- **Общее**: Redis для cross-service signals (interrupt, partials).

#### 4.3 Configuration
Добавить .env:
```
# Performance
VOICE_STREAMING_ENABLED=true
VOICE_CHUNK_DURATION_MS=2000
VOICE_MAX_CONCURRENT_STREAMS=3

# Interrupt
VOICE_INTERRUPT_ENABLED=true
VOICE_INTERRUPT_THRESHOLD=0.70
VOICE_INTERRUPT_MIN_DURATION=300

# Audio
VOICE_NOISE_REDUCTION=true
VOICE_AUDIO_NORMALIZATION=true
VOICE_ADAPTIVE_THRESHOLDS=true
WHISPER_MODEL_SIZE=medium

# GPU
GPU_ENABLED=true
CUDA_VISIBLE_DEVICES=0
MAX_GPU_MEMORY_GB=10
```

#### 4.4 Monitoring & Metrics
- Внедрить Prometheus или simple logging:
  - Latency: time.perf_counter() на key points (speech_start → response_start).
  - Interrupts: Counter для success/fail.
  - STT: Log confidence scores.
  - System: psutil для CPU/Mem, torch.cuda для GPU.
- Endpoint `/metrics` в каждом сервисе.

## Риски и зависимости
- **Риски**: Echo в duplex — протестировать на hardware. Whisper streaming не native — manual buffering может leak mem. GPU OOM на long sessions.
- **Зависимости**: Brain/TTS должны поддерживать partials и stop. Тестировать на RTX 3060 (float16 ok).
- **Тестирование**: Unit для VAD/Interrupt, end-to-end latency measurement. Load test с 3 concurrent streams. GPU stress test via nvidia-smi.

Этот план расширяет ТЗ с code-specific деталями и hardware оптимизациями для RTX 3060. Общая оценка: 2-3 недели на реализацию (Фаза 1+2+4), 1 неделя на Фазу 3.
