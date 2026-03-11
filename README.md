# OpsWatch

OpsWatch is a local-first monitoring and incident platform for portfolio-grade DevOps workflows.

It runs as a multi-service Docker Compose stack and demonstrates the full operational loop:

`define monitor -> schedule checks -> execute checks -> store runs -> evaluate incidents -> suppress in maintenance -> expose metrics -> visualize -> alert`

## Features

- HTTP, TCP, DNS monitoring
- Scheduler + Redis queue + worker execution model
- Automatic incident open/resolve logic
- Maintenance window suppression behavior
- Prometheus metrics from API and worker
- Repository-provisioned Grafana dashboards
- Prometheus + Alertmanager + local webhook alert delivery
- Read-only Next.js dashboard (`Overview`, `Monitors`, `Incidents`, `Checks`)
- Single-VM deployment assets (Caddy TLS ingress, pinned GHCR images, runbook, backup/restore)

## Services

Core stack (`docker-compose.yml`):

- `postgres` (state store)
- `redis` (queue backend)
- `api` (FastAPI control plane)
- `worker` (RQ worker)
- `scheduler` (due-check enqueue loop)
- `prober` (probe-related service scaffold)
- `frontend` (optional profile, Next.js dashboard on `http://localhost:3001`)

Observability overlay (`docker-compose.observability.yml`):

- `prometheus`
- `alertmanager`
- `alert-receiver`
- `grafana`

Deployment stack (`docker-compose.deploy.yml` + `docker-compose.deploy.observability.yml`):

- Caddy as public ingress (`80/443`)
- API + frontend exposed through Caddy
- Postgres/Redis/Prometheus/Alertmanager/Grafana not publicly published by default
- Pinned GHCR app images by release tag (`OPSWATCH_IMAGE_TAG`)
- Explicit one-off migration service (`migrate`)

## Quickstart

### Requirements

- Docker + Docker Compose
- Node.js 22+ (only for native frontend development)

### 1) Start backend stack

```bash
docker compose up -d --build
```

### 2) Verify API

```bash
curl http://localhost:8000/health
```

## Frontend Dashboard

### Native local frontend dev (recommended)

```bash
cd frontend
npm install
OPSWATCH_API_ORIGIN=http://localhost:8000 npm run dev -- --port 3001
```

Dashboard URL: `http://localhost:3001`

The frontend proxies backend traffic via `/api/*`, so no CORS changes are required.

### Optional frontend via Docker Compose profile

```bash
docker compose --profile frontend up -d frontend
```

Dashboard URL: `http://localhost:3001`

## Observability Stack

### Start with standard alert timings

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  --profile observability up -d --build
```

### Start with dev-fast alert timings

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml \
  -f docker-compose.observability.dev-fast.yml \
  --profile observability up -d --build
```

### URLs

- API docs: `http://localhost:8000/docs`
- Frontend dashboard: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Grafana: `http://localhost:3000` (`admin/admin`)
- Alert webhook receiver: `http://localhost:8088`

## Single-VM Deployment

Use the deployment guide for production-like VM setup:

- [deploy/README.md](deploy/README.md)
- [docs/runbook.md](docs/runbook.md)

Key points:

- explicit `deploy-migrate` before `deploy-up`
- Caddy TLS ingress with public domain
- image pinning via `OPSWATCH_IMAGE_TAG`
- daily Postgres custom-format backups (`pg_dump -Fc`) and restore workflow
- rollback by pinning prior release tag and re-validating

## Alert Firing Quick Test

Use dev-fast rules for quicker validation:

1. Start observability with `docker-compose.observability.dev-fast.yml`.
2. Stop API temporarily:

```bash
docker compose stop api
```

3. Wait for `OpsWatchAPIScrapeDown` to fire in Prometheus/Alertmanager.
4. Check delivery at receiver logs:

```bash
docker compose logs -f --tail=200 alert-receiver
```

5. Restore API:

```bash
docker compose start api
```

6. Confirm resolved notification delivery.

## API Overview

### Health

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

### Version

- `GET /api/version` -> `{version, commit, built_at}`

### Monitors

- `POST /api/monitors`
- `GET /api/monitors`
- `GET /api/monitors/{id}`
- `PATCH /api/monitors/{id}`
- `DELETE /api/monitors/{id}`
- `POST /api/monitors/{id}/run`

### Runs

- `GET /api/runs?limit=&success=&monitor_id=`
- `GET /api/monitors/{id}/runs`
- `GET /api/runs/{run_id}`

### Incidents

- `GET /api/incidents`
- `GET /api/incidents/open`
- `GET /api/incidents/{incident_id}`

### Status and Stats

- `GET /api/status`
- `GET /api/summary`
- `GET /api/stats/overview`
- `GET /api/monitors/{id}/stats`

### Maintenance

- `POST /api/maintenance`
- `GET /api/maintenance`
- `DELETE /api/maintenance/{id}`

## Helper Commands

A root `Makefile` proxies to `scripts/makefile`.

Examples:

```bash
make up
make obs-up
make obs-up-dev-fast
make frontend-install
make frontend-lint
make frontend-typecheck
make frontend-test
make frontend-build
make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make ci
```

## Testing and Quality

Backend:

```bash
uvx ruff check --config ruff.toml --ignore B008 .
uvx ruff format --config ruff.toml --check .
uvx pytest -q
```

Frontend:

```bash
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```
