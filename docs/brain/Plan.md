Brain Service — Полный план рефакторинга с упором на краткосрочную память (STM)

Цель: разложить монолитный main.py на слои, унифицировать стриминг (NDJSON), стабилизировать study/bookshelf/workbench, ввести краткосрочную память (STM), и обеспечить простое подключение новых tools без правок ядра.

0) Общие принципы

SOLID/DRY: одна ответственность на модуль/класс; убираем дубли (LLM-вызовы, Redis-скан, стриминг, JSON-парсинг).

Async end-to-end: Redis/HTTP/LLM только через async-клиенты, единые пулы на приложение.

Тестируемость: бизнес-логика вне роутеров; зависимости через DI (Depends) — легко мокать.

Безопасность/производительность: Pydantic-валидация, rate limiting на LLM-эндпоинты, кэш для Sefaria.

Инструменты: ruff/black, mypy, pre-commit, pytest (+ интеграционные).

1) Целевая архитектура (древо каталогов)
brain_service/
  main.py
  api/
    chat.py
    study.py
    actions.py
    admin.py
  services/
    chat_service.py
    study_service.py
    translation_service.py
    lexicon_service.py
    speechify_service.py
    llm_service.py           # фасад провайдера LLM + запуск конвейера
    session_service.py       # абстракция поверх Redis для сессий/снапшотов
    sefaria_service.py       # обёртки Sefaria + кэш Redis
    config_service.py        # hot-reload конфигов (pub/sub)
    memory_service.py        # STM (краткосрочная) + долговременная память (опц.)
  domain/
    chat/llm_stream.py       # конвейер стриминга, события, tool-calls
    chat/tools.py            # ToolRegistry (регистрация/вызов инструментов)
    study/models.py          # инварианты снапшотов/workbench/bookshelf
  models/
    chat_models.py
    study_models.py
    admin_models.py
    common.py
  core/
    startup.py               # lifespan: init/close httpx, redis, tasks
    dependencies.py          # DI фабрики (Depends)
    middleware.py            # CORS, AdminAuth, request_id, logging context
    exceptions.py            # единые JSON-ошибки
    settings.py              # Pydantic Settings (.env)
    logging_config.py        # настройка структурного логирования (см. раздел в конце)
  utils/
    streaming.py             # NDJSON-writer/reader, адаптеры
    text_clean.py            # html-unescape x2, вырезка тегов
    ids.py                   # генерация session/chat/request id
  tests/
    unit/
    integration/

2) Жизненный цикл (lifespan) и DI

Задачи

В core/startup.py описать asynccontextmanager lifespan(app): создать app.state.http, app.state.redis, app.state.task_registry, app.state.tools, сервисы.

На shutdown — отменить/дождаться фоновых задач; закрыть клиенты.

В core/dependencies.py — фабрики Depends для доступа к клиентам/сервисам.

Скелет

# core/startup.py
from contextlib import asynccontextmanager
import asyncio, contextlib, httpx
from fastapi import FastAPI
from .settings import Settings
from .logging_config import setup_logging
from ..services.config_service import ConfigService
from ..domain.chat.tools import ToolRegistry

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()               # pydantic BaseSettings
    setup_logging(settings)             # JSON-логи, см. раздел Logging
    app.state.settings = settings
    app.state.task_registry = set()
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    app.state.redis = await init_redis(settings.REDIS_URL)  # реализуете
    app.state.config = ConfigService(app.state.redis)
    app.state.tools = ToolRegistry()

    cfg_task = asyncio.create_task(app.state.config.listen_updates())
    app.state.task_registry.add(cfg_task)

    try:
        yield
    finally:
        for t in list(app.state.task_registry):
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        await app.state.http.aclose()
        await app.state.redis.aclose()


main.py:

from fastapi import FastAPI
from .core.startup import lifespan
from .core.exceptions import setup_exception_handlers
from .core.middleware import setup_middleware
from .api import chat, study, actions, admin

app = FastAPI(title="Brain Service", version="24.9.0", lifespan=lifespan)
setup_exception_handlers(app)
setup_middleware(app)

app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(study.router, prefix="/study", tags=["study"])
app.include_router(actions.router, prefix="/actions", tags=["actions"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "brain"}

3) Тонкие роутеры + NDJSON-стриминг

Правила

Во всех стрим-эндпоинтах единый MIME: application/x-ndjson.

События — по строке: { "type": "token|tool_call|tool_result|message|error|end", "data": ... }.

Всегда завершаем {"type":"end"}.

# api/chat.py
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..models.chat_models import ChatRequest
from ..services.chat_service import ChatService

router = APIRouter()

@router.post("/stream")
async def chat_stream(req: ChatRequest, svc: ChatService = Depends(ChatService.dep)):
    gen = svc.process_stream(req)  # AsyncGenerator[dict]
    # utils.streaming.to_ndjson внутри генератора или обёртки
    return StreamingResponse(gen, media_type="application/x-ndjson")

4) Краткосрочная память (STM) — дизайн и реализация

Цель: обеспечить «рабочую память» между сообщениями без переполнения контекста, с TTL и детерминированной интеграцией в промпт.

4.1. Хранилище STM (Redis)

Ключ stm:<session_id> → JSON:

summary_v1: краткая сводка последних обсуждений (300–800 токенов).

salient_facts: список фактов/терминов/рефов (до 50), для быстрого напоминания.

open_loops: незакрытые вопросы/задачи (до 10).

ts_updated: метка времени.

TTL: 24 часа (конфигурируемо через .env).

4.2. Триггеры обновления STM

После завершения стрима ответа:

Если chat_local превысил порог (например, >8 сообщений или >2000 токенов), вызвать memory_service.update_stm(...).

Обновление STM делает LLM-сжатие последних K сообщений → summary_v1/salient_facts/open_loops, слияние с предыдущим STM (дедупликация).

4.3. Подмешивание STM в запрос

В LLMService.stream(...) перед отправкой:

Если есть STM — вставить в начало messages системный блок [STM] с summary_v1 и (опционно) 2–5 самых релевантных salient_facts.

# services/memory_service.py (примерный каркас)
import json, time

class MemoryService:
    def __init__(self, redis, ttl_sec: int):
        self.redis = redis
        self.ttl = ttl_sec

    async def get_stm(self, session_id: str) -> dict | None:
        raw = await self.redis.get(f"stm:{session_id}")
        return json.loads(raw) if raw else None

    async def update_stm(self, session_id: str, last_messages: list[dict]) -> dict:
        # Вызов LLM для сжатия (жёсткий json_object формат, если поддерживается)
        stm = {
            "summary_v1": "...",
            "salient_facts": [],
            "open_loops": [],
            "ts_updated": time.time()
        }
        await self.redis.set(
            f"stm:{session_id}", json.dumps(stm, ensure_ascii=False), ex=self.ttl
        )
        return stm

# services/llm_service.py (фрагмент)
class LLMService:
    def __init__(self, client_factory, memory: MemoryService):
        self.client_factory = client_factory
        self.memory = memory

    async def stream(self, session_id: str, base_messages: list[dict], task: str, tools):
        client, model = self.client_factory(task)
        messages = []
        stm = await self.memory.get_stm(session_id)
        if stm and stm.get("summary_v1"):
            messages.append({"role":"system", "content": f"[STM]\n{stm['summary_v1']}"})
        messages += base_messages
        async for ev in stream_chat(messages, client, model, tools):
            yield ev

5) Конвейер LLM + ToolRegistry

Задача: убрать if/elif-лес по инструментам и нормализовать поток delta → события.

# domain/chat/tools.py
from typing import Awaitable, Callable

class ToolRegistry:
    def __init__(self):
        self._map: dict[str, Callable[[dict], Awaitable[dict]]] = {}
    def register(self, name: str, handler: Callable[[dict], Awaitable[dict]]):
        self._map[name] = handler
    async def call(self, name: str, args: dict) -> dict:
        fn = self._map.get(name)
        if not fn:
            return {"ok": False, "error": f"unknown tool: {name}"}
        return await fn(args)

# domain/chat/llm_stream.py (очень кратко)
from typing import AsyncGenerator

async def stream_chat(messages, llm_client, model, tools, **kw) -> AsyncGenerator[dict, None]:
    # 1) отправка запроса с stream=True
    # 2) цикл по дельтам → yield {"type":"token","data":text}
    # 3) tool_call: res = await tools.call(name,args) → yield tool_result
    # 4) при необходимости — повтор запроса (ограничить MAX_TOOL_STEPS)
    # 5) финал: {"type":"message", ...} + {"type":"end"}
    yield {"type":"end"}


Регистрация в startup.py после инициализации сервисов:

app.state.tools.register("sefaria_get_text_v3", sefaria_service.get_text)
app.state.tools.register("sefaria_get_related_links", sefaria_service.get_links)
app.state.tools.register("update_commentators_panel", study_service.push_commentators)
app.state.tools.register("speechify", speechify_service.speak)

6) StudyService — инварианты bookshelf/workbench

Правки

workbench_set(slot, ref): если ref не найден в текущем bookshelf, не модифицировать снапшот → 404; лог предупреждения.

set_focus(ref): атомарно получить window + bookshelf; если bookshelf упал — сохранить старый bookshelf и вернуть предупреждение, не пустить пустой список.

Redis-кэш для Sefaria get_text_v3/links на 30–120 секунд.

Интеграционный тест

set_focus → bookshelf.items > 0

workbench.set(left=refFromShelf)

chat.set_focus(newRef)

bookshelf остаётся непустым.

7) Сервисы доступа к данным

session_service: ключи Redis (session:*), TTL, сериализация/валидация; сканирование — централизованно.

sefaria_service: get_text_v3, get_related_links, get_lexicon_entry через общий httpx; кэш Redis по ключу ref+params.

config_service: pub/sub listener (автопереподключение).

memory_service: STM (как выше) + (опционально) долговременная память (архив JSONL/HTML).

8) Безопасность и ошибки

/admin/* — заголовок X-Admin-Token (из settings), зависимость require_admin.

core/exceptions.py — ServiceError, NotFound, BadInput → JSON-ответы 4xx/5xx.

В NDJSON-стриме ошибки всегда как {"type":"error","code":...,"message":...} и не рвут соединение без end.

9) Логи/наблюдаемость (кратко; полная структура ниже)

Middleware: request_id, session_id из тела/квери → в контекст логов автоматически.

Структурные JSON-логи: event, level, ts, request_id, session_id, agent_id, ref, latency_ms.

Health-probe: ping Redis, быстрый echo LLM, версия конфигурации.

10) Тестирование

Unit:

utils/text_clean,

domain/chat/tools (регистрация/ошибки),

services/study_service (инварианты),

memory_service.update_stm (слияние фактов/TTL).

Integration:

/chat/stream (заглушка LLM) → token → tool_call → tool_result → end.

/study/* навигация.

/actions/* NDJSON-формат.

CI: ruff/mypy/pytest + артефакты покрытия.

11) Пошаговая миграция и коммиты

feat(core): lifespan, общий httpx, redis, ToolRegistry; /health.

feat(utils): NDJSON writer + text_clean; все стримы → application/x-ndjson.

feat(domain): llm_stream и тип событий; LLMService.stream() вызывает конвейер.

feat(services): session_service, sefaria_service (кэш), study_service (инварианты), memory_service (STM v1).

feat(api): разнести роутеры; DI через Depends.

feat(security): X-Admin-Token, exception handlers, request_id middleware.

test/docs/chore: тесты, README, удаление legacy.

12) Настройки окружения (.env пример)
BRAIN_PORT=7030
REDIS_URL=redis://localhost:6379/0
ADMIN_TOKEN=...secret...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
STREAM_FORMAT=ndjson
MAX_TOOL_STEPS=3

STM_TTL_SEC=86400
STM_TRIGGER_MSGS=8
STM_TRIGGER_TOKENS=2000

SEFARIA_CACHE_TTL=60
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=INFO
LOG_JSON=true
LOG_SAMPLING_ERROR_RATE=1.0
LOG_SAMPLING_INFO_RATE=0.2

Структура логирования (без «пробрасывания логов»)

Требование: не тащить логгер по функциям, а автоматически обогащать записи контекстом запроса/сессии. Решение — контекстное логирование: middleware заполняет contextvars, JSON-форматтер читает их и добавляет в каждую запись.

Цели

Автоматический контекст: request_id, session_id, agent_id, user_id, ref — без ручной передачи.

Структурные JSON-логи: удобны для поиска/метрик.

Меньше шума: семплирование INFO, полные ERROR/WARNING.

Корреляция: одинаковый request_id во всех слоях.

Готовность к внешним стекам: поддержка консоли, файла, OTLP/Elastic.

Компоненты

contextvars:

# core/logging_context.py
import contextvars
request_id_var = contextvars.ContextVar("request_id", default=None)
session_id_var = contextvars.ContextVar("session_id", default=None)
agent_id_var = contextvars.ContextVar("agent_id", default=None)
user_id_var = contextvars.ContextVar("user_id", default=None)
ref_var = contextvars.ContextVar("ref", default=None)


Middleware для привязки контекста:

Генерирует request_id (или читает из заголовка).

Извлекает session_id/agent_id/user_id из query/body/headers (по вашим правилам).

Ставит значения в contextvars для текущей корутины.

# core/middleware.py (фрагмент)
from .logging_context import request_id_var, session_id_var, agent_id_var, user_id_var

def setup_middleware(app):
    @app.middleware("http")
    async def bind_context(request, call_next):
        rid = request.headers.get("X-Request-Id") or generate_uuid()
        request_id_var.set(rid)
        # Пример: читаем session_id из query/body
        session_id_var.set(request.query_params.get("session_id"))
        agent_id_var.set(request.headers.get("X-Agent-Id"))
        user_id_var.set(request.headers.get("X-User-Id"))
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


JSON-форматтер с обогащением:

Перехватывает каждую запись и добавляет контекст из contextvars.

Не нужен «проброс» логгера в коде; достаточно logging.getLogger(__name__).

# core/logging_config.py
import logging, json, time
from .logging_context import request_id_var, session_id_var, agent_id_var, user_id_var, ref_var

class JsonContextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = {
            "ts": time.time(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        # контекст
        ctx = {
            "request_id": request_id_var.get(),
            "session_id": session_id_var.get(),
            "agent_id": agent_id_var.get(),
            "user_id": user_id_var.get(),
            "ref": ref_var.get(),
        }
        # дополнительные поля через record.__dict__
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            base.update(record.extra)
        base.update({k: v for k, v in ctx.items() if v is not None})
        return json.dumps(base, ensure_ascii=False)

def setup_logging(settings):
    root = logging.getLogger()
    root.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    handler = logging.StreamHandler()
    handler.setFormatter(JsonContextFormatter())
    root.handlers = [handler]


Уровни и таксономия событий:

INFO: бизнес-вехи (начало/конец стрима, tool_call, cache_hit/miss, stm_update).

WARNING: деградации (fallback, retry, кэш-истёк).

ERROR: исключения (ошибки инструментов/LLM/Redis/HTTP).

DEBUG: подробности, только в dev.

Соглашения:

event: краткое действие в snake_case, напр. chat_stream_started, tool_call, sefaria_cache_miss.

Доп. поля: latency_ms, model, tool, status, retries, cache_key.

Примеры:

log = logging.getLogger("brain.chat")

log.info("chat_stream_started", extra={"extra":{"model": model}})
log.info("tool_call", extra={"extra":{"tool": tool_name}})
log.warning("sefaria_cache_miss", extra={"extra":{"ref": ref}})
log.error("llm_stream_error", extra={"extra":{"error": str(e), "retries": tries}})


Заметь: extra={"extra": {...}} — потому что JsonContextFormatter читает record.extra. Если хочешь плоскую схему, в форматтере возьми любые record.__dict__ ключи и слей в base.

Sampling (чтобы не тонуть в INFO):
Добавь фильтр-семплер на хендлер:

class LevelSamplingFilter(logging.Filter):
    def __init__(self, rate_info: float = 0.2):
        super().__init__()
        self.rate_info = rate_info
    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno == logging.INFO:
            # простое рандом-семплирование
            import random
            return random.random() < self.rate_info
        return True

handler.addFilter(LevelSamplingFilter(rate_info=float(settings.LOG_SAMPLING_INFO_RATE)))


Синки:

Консоль (стандартно).

Ротация в файл (если нужно): logging.handlers.TimedRotatingFileHandler.

OTLP/Elastic — при желании (через дополнительный handler).

Логи в стримах (NDJSON):
Внутри генератора не спамим INFO на каждый токен. Логируем:

chat_stream_started/finished,

tool_call/tool_result,

stm_update_triggered/done,

error.

Корреляция фронт↔бэк:

Клиент может прислать X-Request-Id — мы прокидываем его обратно и логируем.

Все записи, созданные в ходе этого запроса, будут иметь общий request_id.

Итог по логам

Никакого ручного «пробрасывания логгера» по коду.

Контекст ляжет автоматически через contextvars и middleware.

JSON-формат — готов к grep/Elastic/OTLP.

Семплирование INFO, полные WARNING/ERROR.

Единая таксономия событий для поиска инцидентов.

Если захочешь, дополню файл патчами под твой текущий main.py:

переход на lifespan,

перевод стримов на NDJSON,

каркас MemoryService.update_stm() + интеграция в LLMService.stream(),

и готовые заготовки для логирования (formatter, middleware, фильтры).