# Brain Service Deployment Guide

This folder contains a self-contained recipe for packaging and running the
`brain_service` module on a remote server.  The primary goals are:

* keep application secrets out of the source repository;
* make upgrades repeatable (`git pull && docker compose up -d --build`);
* give a clear checklist for provisioning the runtime dependencies.

## 1. Prerequisites

1. Docker Engine 24+ and Docker Compose v2.
2. A Redis instance (the provided compose file starts `redis:7-alpine`).
3. The Astra configuration package with your environment-specific settings.
   Store it outside version control and sync it to the server, e.g.:
   ```
   /opt/astra/
     brain_service/        # git checkout of this repo
     config/               # private config package (with defaults/overrides)
   ```

## 2. Prepare secrets

1. Copy `brain_service/.env.example` to `brain_service/.env` for local work, or
   copy `deploy/brain_service/brain_service.env.example` to
   `deploy/brain_service/brain_service.env` for Docker deployments.
2. Fill in the real tokens (`ADMIN_TOKEN`, `OPENROUTER_API_KEY`, etc.).  
   Never commit the populated `.env` file.
3. Sync the private `config/` package to the server.  The compose file mounts
   `../../config` into the container at `/app/config`.  Adjust the bind mount if
   your layout differs.

## 3. Build & run

From the repository root on the server:

```sh
cd deploy/brain_service
cp brain_service.env.example brain_service.env  # edit the copy
docker compose up -d --build
```

This builds the image from `brain_service/Dockerfile`, starts the FastAPI
service on port `7030`, and runs Redis alongside it.

## 4. Updating

To deploy a new version:

```sh
cd /opt/astra/brain_service_repo
git pull
docker compose pull  # optional, ensures base images are current
docker compose up -d --build
```

Configuration overrides live outside the container, so they persist across
restarts.  Rotate secrets by editing `brain_service.env` or updating the
external secret manager, then `docker compose up -d` to propagate the changes.

## 5. Hardening checklist

- [ ] Restrict access to the `.env` file (`chmod 600`).
- [ ] Mount the `config/` directory read-only (already in the compose file).
- [ ] Configure a firewall so only trusted front-ends can reach port 7030.
- [ ] If running behind a reverse proxy, terminate TLS at the proxy layer.
- [ ] Set `ADMIN_TOKEN` to a strong random string and rotate regularly.
- [ ] Consider storing secrets in your platform's secret manager and inject
      them into the container environment rather than storing them on disk.

## 6. Local smoke-test

To verify everything before pushing to a server:

```sh
docker build -t astra/brain-service:test ../../brain_service
docker run --rm \
  -p 7030:7030 \
  -v "$(pwd)/../../config:/app/config:ro" \
  --env-file brain_service.env \
  astra/brain-service:test
```

When the container prints `Startup complete. Yielding to application.` the
service is ready.  Visit `http://localhost:7030/health` to confirm the health
endpoint responds.
