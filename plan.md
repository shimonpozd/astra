# Astra Admin + User Management Roadmap

## 1. Цели
- Дать админам возможность вручную регистрировать пользователей из веб-панели.
- Присвоить каждому пользователю собственный API‑ключ (OpenRouter), вести лимиты и учёт использования.
- Сохранить прозрачность архитектуры: документировать связи фронтенда, backend и конфигурации.

## 2. Обновления Backend
- [ ] Миграция БД:
  - Таблица `user_api_keys` (`id`, `user_id`, `provider`, `api_key`, `daily_limit`, `usage_today`, `last_reset_at`, `is_active`).
  - Новые поля в `users`: `created_manually` (bool), `last_login_at`, `notes` (опционально).
- [ ] UserService:
  - методы `create_user`, `list_users`, `update_user`, `set_password`;
  - CRUD для ключей (`create_key`, `list_keys`, `update_key`, `record_usage`, `disable_key`).
- [ ] API:
  - `POST /api/users` — ручная регистрация;
  - `GET/PUT /api/users/{id}`;
  - `GET/POST/DELETE /api/users/{id}/api-keys`;
  - обработка ошибок и валидация.
- [ ] Интеграция с LLM:
  - `core.llm_config.get_llm_for_task` ищет ключ в контексте запроса (фронт передаёт user_id);
  - LLMService обновляет `usage_today`, проверяет лимит, возвращает 429/403 при превышении.

## 3. Обновления Frontend
- [ ] Новая вкладка в `AdminLayout`: `Users`.
- [ ] Компонент `AdminUserTable`:
  - Список пользователей (username, role, status, created_at, last_login, признак наличия ключа).
  - Кнопка «Создать пользователя» → модал (логин, пароль, роль, активность).
- [ ] Компонент `ApiKeyManager`:
  - Просмотр API‑ключей конкретного пользователя (маскированный токен, лимит, активен);
  - Форма добавления ключа (provider, api_key, лимит);
  - Кнопки «Deactivate», «Reset usage».
- [ ] Фронт-хук/сервис `adminUsersService` для запросов `/api/users` и `/api/users/{id}/api-keys`.
- [ ] Обновление `ChatLayout` / `useChat`: при авторизованном запросе передавать `user_id` в backend.

## 4. Безопасность и конфигурация
- [ ] Шифрование API-ключей при хранении (AES/GCM, секрет берём из env).
- [ ] Доступ к ключам только для админов; маскировать ключи в UI (оставлять suffix).
- [ ] Настройки лимитов в `config/services.toml` (дефолтные значения).
- [ ] Логирование превышений и ошибок (warning → info → audit).

## 5. Документация и тесты
- [ ] Описать архитектуру (`docs/`): схема потоков, новое API, модель данных.
- [ ] Написать README для админов: как создавать пользователя и добавлять ключ.
- [ ] Добавить unit/integration тесты:
  - UserService (создание, пароль, ключи, лимиты);
  - API роуты `/users` и `/users/{id}/api-keys`;
  - LLMService — выбор ключа + контроль лимитов.
- [ ] E2E smoke: создать пользователя, выдать ключ, отправить запрос в чат, убедиться, что ключ используется.

## 6. Дальнейшие шаги
- Вебхуки/cron для ежедневного сброса usage.
- UI для статистики использования (графики).
- Поддержка нескольких провайдеров (OpenAI, Anthropic).
- Интеграция с биллингом (в будущем).
