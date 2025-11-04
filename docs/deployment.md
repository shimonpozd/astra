# Astra Deployment Guide (Server Install)

## Overview

Astra состоит из трёх основных блоков:

1. **brain_service** – FastAPI backend + Postgres + Redis.
2. **astra-web-client** – React/Vite SPA, собирается в статический bundle.
3. Внешние сервисы: OpenRouter / OpenAI API, Redis/DB, optionally TTS/STT.

Цель документа – описать минимальный набор шагов, который позволит перенести систему на удалённый сервер и развернуть её с нуля.

---

## 1. Серверные требования

| Компонент           | Минимум                       |
|---------------------|-------------------------------|
| OS                  | Linux x86\_64 (Ubuntu 22.04+) |
| CPU/RAM             | 2 CPU / 4 GB RAM (минимум)    |
| Disk                | ≥ 10 GB свободно              |
| Docker & Compose    | Docker Engine 24+, Compose v2 |
| Node.js (для build) | v18+ (можно собирать локально)|

Файрвол (ufw/iptables) должен разрешать:

- TCP 7030 (brain_service, если доступен извне);
- TCP 5432 (Postgres) и 6379 (Redis) – **только** внутри внутренней сети/over Docker network.

---

## 2. Конфигурационные файлы и секреты

1. **env**: базовая конфигурация лежит в `brain_service/.env.example`. Скопируйте в `.env` и заполните:
   - `DATABASE_URL` (Postgres DSN);
   - `REDIS_URL`;
   - `OPENROUTER_API_KEY` / `OPENAI_API_KEY`;
   - `API_KEY_SECRET` – 32 байта (используется для шифрования пользовательских ключей).

2. **TOML конфиг**: каталог `config/` содержит `defaults.toml` и `overrides.toml`. На сервере держим собственную копию:
   ```
   /opt/astra/config/defaults.toml      # из репозитория
   /opt/astra/config/overrides.toml     # приватные правки
   ```

3. **Frontend `.env`** (если нужно прокинуть URL API или фичи) – `astra-web-client/.env` (см. `.env.sample`).

4. **Общие секреты** – хранить в менеджере секретов или в файле с правами 600. Никогда не коммитить в git.

---

## 3. Backend (brain_service)

### 3.1 Быстрый старт на Docker Compose

```bash
cd /opt/astra        # каталог проекта
cp deploy/brain_service/brain_service.env.example deploy/brain_service/brain_service.env
vim deploy/brain_service/brain_service.env         # заполнить реальные значения

docker compose -f deploy/brain_service/docker-compose.yml up -d --build
```

В комплекте:
- `brain_service` (uvicorn) → 7030;
- `postgres` → 5432;
- `redis` → 6379.

Рекомендуется подключить реверс-прокси (nginx/traefik) для HTTPS и авторизации.

### 3.2 Ручной деплой (systemd)

1. Создать виртуальное окружение:
   ```bash
   cd /opt/astra/brain_service
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Применить схему БД (создаётся автоматически при старте; для миграций используем Alembic – TBD).

3. Systemd unit (упрощённый пример):
   ```
   [Unit]
   Description=Astra Brain Service
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/opt/astra/brain_service
   EnvironmentFile=/opt/astra/brain_service/.env
   ExecStart=/opt/astra/brain_service/.venv/bin/uvicorn brain_service.main:app --host 0.0.0.0 --port 7030
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

4. Логи – через journald или отдельный файловый обработчик (см. `brain_service/core/logging_config.py`).

### 3.3 Проверка

```bash
curl http://localhost:7030/health
```

В логах должна появиться строка `Startup complete. Yielding to application.`.

---

## 4. Frontend (astra-web-client)

### 4.1 Сборка

Собрать можно локально или на сервере (нужен Node.js 18+):

```bash
cd /opt/astra/astra-web-client
pnpm install          # или npm install/yarn install
pnpm build            # build → dist/
```

Результат – статические файлы в `dist/`. Их можно отдать через любой HTTP-сервер:

- nginx (копировать в `/usr/share/nginx/html` + настроить прокси на `/api` → 7030);
- Docker (см. `FROM nginx:alpine` и `COPY dist /usr/share/nginx/html`).

### 4.2 Пример конфигурации nginx

```
server {
    listen 80;
    server_name example.com;

    root /var/www/astra/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:7030/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

---

## 5. Подготовка данных и сервисов

1. **Postgres**:
   - создать БД `astra_brain`;
   - настроить пользователя `astra` с паролем;
   - применить схему (`Base.metadata.create_all` делается автоматически при старте).

2. **Redis**:
   - достаточно дефолтной установки (`redis-server`), но лучше включить `requirepass`.

3. **OpenRouter/OpenAI**:
   - проверить, что сервер имеет доступ к интернету и API;
   - задать `OPENROUTER_API_KEY`/`OPENAI_API_KEY` в `.env`.

4. **Пользователи**:
   - первый админ создаётся скриптом:
     ```bash
     cd /opt/astra/brain_service
     source .venv/bin/activate
     python -m brain_service.scripts.create_user --username admin --role admin --update
     ```
   - в админке можно задать индивидуальные API ключи (используется шифрование с `API_KEY_SECRET`).

---

## 6. Обновления и резервное копирование

- **Обновление приложения**:
  ```
  cd /opt/astra
  git pull
  docker compose -f deploy/brain_service/docker-compose.yml up -d --build
  ```
  либо перезапустить systemd unit.

- **Бэкапы**:
  - Postgres: `pg_dump astra_brain > backup.sql`;
  - Redis (RDB) – копия `dump.rdb`.

- **Логи**:
  - backend: `/var/log/astra/brain_service.log` (если настроен file handler) или `journalctl -u astra-brain`.
  - frontend: nginx access/error.

---

## 7. Чеклист перед запуском

- [ ] Заполнены `.env` и `config/overrides.toml`.
- [ ] Настроены Postgres и Redis, доступны из контейнера/приложения.
- [ ] Пропущен open firewall (HTTPS + API).
- [ ] Админ создан, авторизация проверена.
- [ ] Заданы индивидуальные API ключи (при необходимости).
- [ ] Запущены smoke-тесты (логин, создание чата, учебная сессия).

---

## 8. Дальнейшие шаги (опционально)

- Подключить ротацию логов и мониторинг (Prometheus/Grafana).
- Настроить reverse proxy с Let’s Encrypt (certbot/nginx).
- Реализовать автоматическую миграцию через Alembic.
- Добавить роли (read-only, editor) и двухфакторную авторизацию.

---

### Контакты / Отладка

- Проверка активности: `curl -s http://localhost:7030/health`.
- Логи FastAPI: `journalctl -u astra-brain -f` или `docker logs brain_service`.
- Очистка кэша Redis: `redis-cli FLUSHALL`.

При возникновении вопросов фиксируйте логи и присылайте вместе с запросом.
