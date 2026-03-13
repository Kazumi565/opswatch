# OpsWatch

OpsWatch is a local-first monitoring and incident platform built as a production-ops showcase.

It demonstrates the full operational loop:

`define monitor -> migrate -> schedule checks -> execute checks -> evaluate incidents -> acknowledge and track -> audit control-plane changes -> expose metrics -> visualize -> alert`

## What 0.2.0 Adds

- migration-gated startup from an empty database
- realistic demo seed data via `make demo-seed`
- API-key protection for mutating routes
- audit log for control-plane actions
- ownership-aware monitors: `service`, `environment`, `owner`, `severity`, `runbook_url`
- incident lifecycle states: `open`, `acknowledged`, `resolved`
- incident timeline events and operator notes
- Prometheus labels enriched with safe ownership context

## Services

Core stack in [docker-compose.yml](/home/mihai/projects/opswatch/docker-compose.yml):

- `postgres`: state store
- `redis`: queue backend
- `migrate`: one-shot Alembic upgrade step
- `api`: FastAPI control plane
- `worker`: RQ worker
- `scheduler`: due-check enqueue loop
- `prober`: probe-related scaffold
- `frontend`: optional profile on `http://localhost:3001`

Observability overlay in [docker-compose.observability.yml](/home/mihai/projects/opswatch/docker-compose.observability.yml):

- `prometheus`
- `alertmanager`
- `alert-receiver`
- `grafana`

Deployment stack:

- [docker-compose.deploy.yml](/home/mihai/projects/opswatch/docker-compose.deploy.yml)
- [docker-compose.deploy.observability.yml](/home/mihai/projects/opswatch/docker-compose.deploy.observability.yml)
- [deploy/README.md](/home/mihai/projects/opswatch/deploy/README.md)

## Quickstart

### 1. Prepare env

```bash
cp .env.example .env
```

Important values:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `OPSWATCH_API_KEY`

Set `OPSWATCH_API_KEY` in your local `.env` to a long random secret. The committed `.env.example` uses placeholder values only.

### 2. Start the core stack

```bash
make up
```

This boots `postgres` and `redis`, runs `alembic upgrade head` in the one-shot `migrate` container, and only then starts the API, worker, and scheduler.

For a polished demo or release-style local run that automatically injects the current git SHA and a UTC build timestamp into the API footer, use:

```bash
make showcase-up
```

### 3. Verify readiness

```bash
curl http://localhost:8000/ready
```

Expected: `status=ok`, DB ready, Redis ready, and the current Alembic revision returned.

### 4. Seed realistic demo data

```bash
make demo-seed
```

The seed command is intentionally safe-by-default: it expects an empty database and exits if monitors already exist.

### 5. Start the frontend

```bash
docker compose --profile frontend up -d frontend
```

Dashboard URL: `http://localhost:3001`

## Demo From Fresh Clone

### Core demo path

```bash
cp .env.example .env
make showcase-up
curl http://localhost:8000/ready
make demo-seed
docker compose --profile frontend up -d frontend
```

Open:

- API docs: `http://localhost:8000/docs`
- Frontend dashboard: `http://localhost:3001`
- Ready check: `http://localhost:8000/ready`

What the seeded dataset demonstrates:

- a healthy owned service with historical runs
- an active open incident
- an acknowledged incident with timeline notes
- an active maintenance window
- enough run history to populate charts
- audit records for seeded control-plane actions

### Full showcase with observability

```bash
make showcase-obs-up
docker compose --profile frontend up -d frontend
```

Observability URLs:

- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Grafana: `http://localhost:3000`
- Alert receiver: `http://localhost:8088`

## Auth Model

Read routes are public in `0.2.0`.

Mutating routes require the `X-API-Key` header and are checked against `OPSWATCH_API_KEY`.

Protected routes include:

- monitor create/update/delete
- manual run enqueue
- maintenance create/delete
- incident acknowledge
- incident note creation

Example:

```bash
curl -X POST http://localhost:8000/api/monitors \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: replace-with-a-long-random-api-key' \
  -d '{
    "name": "edge-api-prod",
    "type": "http",
    "service": "edge-api",
    "environment": "prod",
    "owner": "platform@opswatch.dev",
    "severity": "high",
    "runbook_url": "https://runbooks.example.com/edge-api",
    "target": "https://example.com",
    "interval_seconds": 60,
    "timeout_seconds": 5,
    "incident_threshold": 3,
    "retries": 0,
    "enabled": true
  }'
```

## Build Metadata

Local development keeps build metadata optional. If `APP_COMMIT` and `APP_BUILT_AT` are not injected, the dashboard footer falls back to showing only the API version.

Demo, CI, and release-style Compose runs can inject metadata automatically from the current git checkout:

- `APP_COMMIT`: short git SHA
- `APP_BUILT_AT`: UTC timestamp in ISO-8601 form

Use:

```bash
make showcase-up
```

or with observability:

```bash
make showcase-obs-up
docker compose --profile frontend up -d frontend
```

## Single-VM Deployment

Use the deployment guide for production-like VM setup:

- [deploy/README.md](/home/mihai/projects/opswatch/deploy/README.md)

Key deployment points:

- pinned GHCR image references through the deploy compose files
- Caddy TLS ingress in front of the API and Grafana
- explicit `deploy-migrate` before `deploy-up`
- localhost-bound observability ports in deploy mode
- backup and restore scripts for Postgres
- validation script for post-deploy checks

## Alert Firing Quick Test

Use dev-fast rules for quicker validation:

1. Start observability with `make obs-up-dev-fast`.
2. Stop the API temporarily:

```bash
docker compose stop api
```

3. Wait for `OpsWatchAPIScrapeDown` to fire in Prometheus or Alertmanager.
4. Check receiver delivery:

```bash
docker compose logs -f --tail=200 alert-receiver
```

5. Restore the API:

```bash
docker compose start api
```

6. Confirm resolved delivery.

## API Highlights

### Health

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /ready`

### Monitors

- `POST /api/monitors`
- `GET /api/monitors`
- `GET /api/monitors/{id}`
- `PATCH /api/monitors/{id}`
- `DELETE /api/monitors/{id}`
- `POST /api/monitors/{id}/run`
- `GET /api/monitors/{id}/stats`
- `GET /api/monitors/{id}/runs`

### Runs

- `GET /api/runs`
- `GET /api/runs/{run_id}`

### Incidents

- `GET /api/incidents`
- `GET /api/incidents/open`
- `GET /api/incidents/{incident_id}`
- `POST /api/incidents/{incident_id}/ack`
- `POST /api/incidents/{incident_id}/notes`

### Maintenance and audit

- `POST /api/maintenance`
- `GET /api/maintenance`
- `DELETE /api/maintenance/{id}`
- `GET /api/audit`

### Summary and status

- `GET /api/status`
- `GET /api/summary`
- `GET /api/stats/overview`
- `GET /api/version`
- `GET /metrics`

## Release Verification Checklist

Run these before calling `0.2.0` shippable:

```bash
uvx ruff check --config ruff.toml --ignore B008 .
uvx ruff format --config ruff.toml --check .
uvx pytest -q -s
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

Smoke the real boot path:

```bash
docker compose up -d --build postgres redis migrate api worker scheduler
curl http://localhost:8000/ready
make demo-seed
docker compose down -v
```

Expected signals:

- API does not become ready before migrations are at head
- demo seed populates monitors, runs, incidents, maintenance, and audit records
- mutating routes reject missing or invalid API keys
- `/api/audit` returns control-plane history
- incidents show `open`, `acknowledged`, and `resolved` lifecycle behavior

## Helper Commands

The root [Makefile](/home/mihai/projects/opswatch/Makefile) proxies to [scripts/makefile](/home/mihai/projects/opswatch/scripts/makefile).

Useful targets:

```bash
make up
make showcase-up
make down
make clean
make demo-seed
make obs-up
make obs-up-dev-fast
make frontend-install
make frontend-test
make frontend-build
make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make ci
```
