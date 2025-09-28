# Prompt Registry Plan

## Goal
Centralize all non-system prompts (deep research workflows, study/learning hints, auxiliary tool prompts) into a manageable registry with versioning, API access, and UI editing capabilities.

## Rationale
- Prompts живут в разных файлах Python/JSON → сложно обновлять и тестировать.
- Нужна единая точка правды для фронт-редактора и API.
- Хочется аудита и версионирования, чтобы понимать, кто и когда менял подсказки.

## Proposed Architecture

### 1. Storage Layout
- `prompts/defaults/*.toml` — базовые промты, сгруппированные по доменам (`deep_research`, `study`, `persona/<id>`, `actions` и т.д.).
- `prompts/overrides/*.toml` — runtime/редакторные правки (gitignored).
- `config/prompts.toml` — регистрационный файл, который описывает активные промты, алиасы и метаданные.
- Документ `docs/prompts_schema.md` с описанием полей (`id`, `type`, `context`, `text`, `metadata`, списки placeholders).

### 2. Loader API (Python)
- Новый модуль `config/prompts.py`:
  - `load_prompt(prompt_id: str) -> Prompt`
  - `list_prompts(domain: str | None = None)`
  - Поддержка `${ENV}` placeholders, подобно конфигу.
- Встроенная валидация (markdown, placeholders, JSON tooling hints).

### 3. Brain / backend
- REST endpoints (FastAPI):
  - `GET /admin/prompts`
  - `GET /admin/prompts/{id}`
  - `PUT /admin/prompts/{id}` (с сохранением в overrides и логом)
  - `POST /admin/prompts/{id}/validate`
- Авторизация (общая схема с config API).
- Логирование изменений (пользователь, timestamp, diff).

### 4. Frontend Admin Panel
- Раздел «Prompts» в будущем админ-интерфейсе:
  - Таблица: domain, ID, описание, дата обновления, статус (default/override).
  - Редактор (textarea/CodeMirror) + предпросмотр md-lite.
  - Кнопки «Сохранить», «Вернуть дефолт», отображение diff.
  - Поддержка меток placeholder’ов (`{{placeholder}}`).

### 5. Migration Strategy
1. Инвентаризация текущих промтов (`rg "PROMPT"`, поиск по `system_prompt`, `prompt_template`, т.п.).
2. Перенос в `prompts/defaults` (по domain/ID), обновление кода на `load_prompt("...")`.
3. Для персон — генерация `personalities.json` из новых файлов или переход фронта на API.
4. Переход на API для редактирования (по согласованию с продуктом).

### 6. Testing & QA
- Unit-тесты: валидация шаблонов, placeholders.
- Snapshot-тесты: deep research сценарии vs. новые файлы.
- QA чек-лист: редактирование промта в UI → проверка ответа модели.

### 7. Open Questions
- Где хранить runtime overrides (файлы vs. БД/Redis)?
- Роли и доступ (кто может редактировать какие промты)?
- Нужно ли предусмотреть rollback на уровне API (версионник, Git, или отдельная таблица).

---
_Last updated: 2025-09-26 (Codex)_
