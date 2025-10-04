# Brain Service - Архитектурное руководство

## Обзор

`brain_service` - это полностью рефакторенная версия монолитного `brain/main.py`, построенная на принципах чистой архитектуры с четким разделением ответственности.

## Структура проекта

```
brain_service/
├── main.py                    # Точка входа FastAPI приложения
├── api/                       # Тонкие роутеры (API слой)
│   ├── admin.py              # Административные эндпоинты
│   ├── chat.py               # Основной чат
│   ├── study.py              # Учебный стол (Study Desk)
│   └── actions.py            # Действия (переводы, озвучка)
├── core/                      # Ядро приложения
│   ├── startup.py            # Lifespan менеджер
│   ├── dependencies.py       # DI фабрики
│   ├── middleware.py         # Middleware (логирование, CORS)
│   ├── exceptions.py         # Обработка ошибок
│   ├── settings.py           # Pydantic настройки
│   ├── logging_config.py     # JSON логирование
│   └── utils.py              # Общие утилиты
├── services/                  # Бизнес-логика
│   ├── chat_service.py       # Основной чат
│   ├── study_service.py      # Учебный стол
│   ├── translation_service.py # Переводы
│   ├── speechify_service.py  # Озвучка
│   ├── sefaria_service.py    # Sefaria API
│   ├── sefaria_index_service.py # Sefaria оглавление
│   └── llm_service.py        # LLM провайдеры
├── domain/                    # Доменная логика
│   ├── chat/
│   │   ├── llm_stream.py     # Streaming конвейер
│   │   └── tools.py          # ToolRegistry
│   └── study/
│       └── models.py         # Модели учебного стола
├── models/                    # Pydantic модели
│   ├── chat_models.py
│   ├── study_models.py
│   ├── admin_models.py
│   └── common.py
└── utils/                     # Утилиты
    ├── streaming.py          # NDJSON streaming
    ├── text_clean.py         # Очистка текста
    └── ids.py                # Генерация ID
```

## Жизненный цикл приложения

### 1. Инициализация (startup.py)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Инициализация клиентов
    app.state.http = httpx.AsyncClient()
    app.state.redis = await init_redis()
    
    # Инициализация сервисов
    app.state.sefaria_service = SefariaService(app.state.http, app.state.redis)
    app.state.tools = ToolRegistry()
    
    # Регистрация инструментов
    app.state.tools.register("sefaria_get_text", sefaria_service.get_text)
    
    yield
    
    # Очистка ресурсов
    await app.state.http.aclose()
    await app.state.redis.aclose()
```

### 2. Обработка запроса

1. **Middleware** - Присваивает `request_id`, логирует запрос
2. **Router** - Направляет в соответствующий эндпоинт
3. **Dependencies** - Внедряет нужные сервисы через `Depends`
4. **Service** - Выполняет бизнес-логику
5. **Response** - Возвращает результат

## Ключевые компоненты

### 1. Streaming (NDJSON)

Все streaming эндпоинты используют единый формат:

```json
{"type": "llm_chunk", "data": "текст"}
{"type": "tool_call", "data": {"name": "sefaria_get_text", "args": {...}}}
{"type": "tool_result", "data": {...}}
{"type": "doc_v1", "data": {"type": "doc.v1", "blocks": [...]}}
{"type": "end"}
```

### 2. ToolRegistry

Централизованная система инструментов:

```python
class ToolRegistry:
    def register(self, name: str, handler: Callable):
        self._map[name] = handler
    
    async def call(self, name: str, args: dict) -> dict:
        return await self._map[name](args)
```

**Зарегистрированные инструменты:**
- `sefaria_get_text` - Получение текстов из Sefaria
- `sefaria_get_related_links` - Связанные ссылки
- `update_commentators_panel` - Обновление панели комментаторов
- `speechify` - Озвучка текста

### 3. Study Desk (Учебный стол)

**Компоненты:**
- **FocusReader** - Основной текст
- **Workbench** - Два слота для комментариев
- **Bookshelf** - Панель с доступными комментариями
- **Study Chat** - Чат с двумя режимами

**Режимы чата:**
- **"Иун"** - Объяснение конкретного текста (когда выбран комментарий)
- **"Гирса"** - Общий диалог с контекстом всех панелей

### 4. Sefaria Integration

**SefariaService:**
- `get_text(ref, lang)` - Получение текста
- `get_related_links(ref)` - Связанные ссылки
- Redis кэширование (TTL: 60 сек)

**SefariaIndexService:**
- Загрузка оглавления Sefaria
- Кэширование структуры текстов
- Fallback на локальный Sefaria

### 5. LLM Integration

**Поддерживаемые провайдеры:**
- OpenAI (GPT-4, GPT-4o-mini)
- Anthropic (Claude)
- Local models (Ollama)

**Streaming:**
- Реальное время через Server-Sent Events
- Обработка tool calls
- Контекстное подмешивание

## Конфигурация

### Environment Variables (.env)

```bash
# Основные настройки
BRAIN_PORT=7030
REDIS_URL=redis://localhost:6379/0
ADMIN_TOKEN=your_secret_token

# LLM настройки
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_key

# Sefaria настройки
SEFARIA_BASE_URL=http://localhost:8000
SEFARIA_CACHE_TTL=60

# Логирование
LOG_LEVEL=INFO
LOG_JSON=true
```

### TOML конфигурация

Старая система `.toml` файлов интегрирована:
- `personalities.json` - Личности для чата
- `prompts/` - Промпты для разных режимов
- `astra_services.json` - Настройки сервисов

## API Endpoints

### Chat
- `POST /chat/stream` - Основной чат с streaming
- `POST /chat/sessions` - Управление сессиями

### Study
- `POST /study/chat/stream` - Учебный чат
- `POST /study/snapshot` - Создание снапшота
- `GET /study/snapshot/{id}` - Получение снапшота
- `POST /study/bookshelf` - Получение bookshelf
- `POST /study/workbench/set` - Установка workbench
- `POST /study/focus` - Установка фокуса

### Actions
- `POST /actions/translate` - Перевод текста
- `POST /actions/speechify` - Озвучка

### Admin
- `GET /admin/personalities` - Список личностей
- `POST /admin/personalities` - Создание личности
- `GET /admin/prompts` - Список промптов
- `POST /admin/prompts` - Создание промпта

## Логирование

### Структура логов

```json
{
  "ts": 1759264146.6005626,
  "level": "INFO",
  "logger": "brain_service.services.sefaria_service",
  "event": "Sefaria text retrieved",
  "request_id": "abc-123",
  "session_id": "def-456",
  "ref": "Berakhot.2a",
  "latency_ms": 150
}
```

### Контекстные переменные

Автоматически добавляются через `contextvars`:
- `request_id` - Уникальный ID запроса
- `session_id` - ID сессии чата
- `agent_id` - ID агента
- `ref` - Ссылка на текст

## Обработка ошибок

### Иерархия исключений

```python
class BrainServiceError(Exception): pass
class NotFoundError(BrainServiceError): pass
class BadInputError(BrainServiceError): pass
class ExternalServiceError(BrainServiceError): pass
```

### JSON ответы

```json
{
  "error": "not_found",
  "message": "Session not found",
  "details": {"session_id": "abc-123"}
}
```

## Тестирование

### Запуск тестов

```bash
# Unit тесты
pytest tests/unit/

# Интеграционные тесты
pytest tests/integration/

# Все тесты
pytest
```

### Тестовый клиент

```python
# Пример использования
from tests.test_client import TestClient

client = TestClient()
response = client.study_chat("Explain this text")
```

## Развертывание

### Локальная разработка

```bash
# Запуск всех сервисов
python start_cli.py

# Только brain service
cd brain_service
uvicorn main:app --port 7030
```

### Docker

```bash
# Сборка образа
docker build -t astra-brain .

# Запуск контейнера
docker run -p 7030:7030 astra-brain
```

## Мониторинг

### Health Check

```bash
curl http://localhost:7030/health
```

Ответ:
```json
{
  "status": "healthy",
  "service": "brain_v2",
  "version": "24.9.0"
}
```

### Метрики

- Время ответа LLM
- Количество tool calls
- Cache hit/miss ratio
- Ошибки внешних сервисов

## Миграция с legacy

### Что изменилось

1. **Структура**: Монолитный `main.py` → модульная архитектура
2. **Streaming**: Кастомный формат → NDJSON
3. **Конфигурация**: Только TOML → TOML + Environment
4. **Логирование**: Простые логи → Структурированные JSON
5. **Ошибки**: Исключения → JSON ответы

### Совместимость

- API endpoints остались теми же
- Формат данных не изменился
- Frontend не требует изменений

## Troubleshooting

### Частые проблемы

1. **Sefaria недоступен**
   - Проверить `SEFARIA_BASE_URL`
   - Убедиться что локальный Sefaria запущен

2. **Redis ошибки**
   - Проверить `REDIS_URL`
   - Убедиться что Redis запущен

3. **LLM ошибки**
   - Проверить API ключи
   - Проверить лимиты провайдера

4. **Streaming проблемы**
   - Проверить что frontend поддерживает NDJSON
   - Убедиться что нет конфликтов с doc_v1

### Логи для отладки

```bash
# Фильтрация по request_id
grep "abc-123" logs/brain.log

# Ошибки Sefaria
grep "Sefaria API request error" logs/brain.log

# LLM ошибки
grep "llm_stream_error" logs/brain.log
```

## Заключение

Новая архитектура `brain_service` обеспечивает:

- ✅ **Модульность** - Четкое разделение ответственности
- ✅ **Тестируемость** - DI и изолированные компоненты
- ✅ **Масштабируемость** - Легко добавлять новые функции
- ✅ **Наблюдаемость** - Структурированные логи и метрики
- ✅ **Надежность** - Обработка ошибок и fallback'и

Система готова к дальнейшему развитию и добавлению новых возможностей!


