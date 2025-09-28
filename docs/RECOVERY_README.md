# Восстановление Brain Service

## Что было восстановлено

Я восстановил оригинальную структуру Brain Service на основе того, что помню из первоначальной реализации. Все файлы сохранены с суффиксом `_original_backup` для избежания конфликтов с текущей версией.

### Восстановленные файлы:

1. **`main_original_backup.py`** - Основной файл сервиса с полным функционалом
2. **`structure_backup.md`** - Описание архитектуры и модулей
3. **`redis_session_backup.py`** - Управление сессиями через Redis
4. **`state_original_backup.py`** - Управление состоянием приложения
5. **`llm_config_original_backup.py`** - Конфигурация различных LLM провайдеров
6. **`sefaria_client_original_backup.py`** - Интеграция с Sefaria API
7. **`tts_client_original_backup.py`** - Text-to-Speech функциональность

## Ключевые особенности восстановленной структуры:

### 1. Модульная архитектура
- Каждый компонент в отдельном файле
- Четкое разделение ответственности
- Легкость тестирования и поддержки

### 2. Асинхронность
- Все операции используют async/await
- Высокая производительность
- Поддержка множества одновременных запросов

### 3. Множество провайдеров LLM
- OpenAI (GPT-3.5, GPT-4)
- OpenRouter (DeepSeek, etc.)
- Ollama (локальные модели)
- Автоматический выбор модели по типу задачи

### 4. Интеграция с Sefaria
- Получение текстов и комментариев
- Поиск по текстам
- Кеширование для производительности

### 5. Управление сессиями
- Redis для постоянного хранения
- Автоматическое восстановление сессий
- Разделение кратковременной и долговременной памяти

### 6. TTS интеграция
- Поддержка различных провайдеров
- Кеширование аудио
- Настройка голоса и скорости

## Как использовать восстановленные файлы:

### 1. Замена текущего main.py
```bash
cp brain/main_original_backup.py brain/main.py
```

### 2. Восстановление модулей
```bash
cp brain/redis_session_backup.py brain/redis_session.py
cp brain/state_original_backup.py brain/state.py
cp brain/llm_config_original_backup.py brain/llm_config.py
cp brain/sefaria_client_original_backup.py brain/sefaria_client.py
cp brain/tts_client_original_backup.py brain/tts_client.py
```

### 3. Обновление импортов в main.py
Нужно обновить импорты в main.py для использования новых модулей:

```python
from .redis_session import get_session, save_session
from .state import state, Session, Message
from .llm_config import get_llm_for_task, LLMConfigError
from .sefaria_client import sefaria_get_text_v3_async, sefaria_get_related_links_async
from .tts_client import get_tts_client
```

## Основные эндпоинты:

- `POST /chat/stream` - Стриминг ответов от AI
- `GET /chats` - Получение списка чатов
- `GET /chats/{session_id}` - Получение истории чата
- `GET /health` - Проверка здоровья сервиса

## Переменные окружения:

- `REDIS_URL` - URL Redis сервера
- `OPENAI_API_KEY` - API ключ OpenAI
- `OPENROUTER_API_KEY` - API ключ OpenRouter
- `MEMORY_SERVICE_URL` - URL сервиса памяти
- `TTS_SERVICE_URL` - URL TTS сервиса
- `OPENAI_TEMPERATURE` - Температура для моделей
- `OPENAI_MAX_TOKENS` - Максимальное количество токенов

## Запуск:

```bash
cd brain
python main.py
```

Сервис будет доступен на http://localhost:7030

## Преимущества восстановленной структуры:

1. **Стабильность** - проверенная временем архитектура
2. **Масштабируемость** - легко добавлять новые функции
3. **Производительность** - асинхронность и кеширование
4. **Гибкость** - поддержка различных провайдеров
5. **Отказоустойчивость** - обработка ошибок и fallback'и

Эта структура была оптимизирована для работы с еврейскими текстами, исследованиями и многоязычным контентом.