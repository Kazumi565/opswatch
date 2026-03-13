# OpsWatch

OpsWatch is a local-first monitoring and incident platform built as a DevOps showcase project.

The point of the project is not just "check if a URL is up." It tries to show the whole operational loop:

`define monitor -> migrate -> schedule -> probe -> create incidents -> acknowledge and track -> audit control-plane changes -> expose metrics -> visualize -> alert`

## What 0.2.0 Focuses On

- migration-gated startup from an empty database
- realistic demo data with `make demo-seed`
- protected write routes with a shared API key
- audit logging for control-plane actions
- ownership-aware monitors with `service`, `environment`, `owner`, `severity`, and `runbook_url`
- incident states: `open`, `acknowledged`, `resolved`
- incident timeline events and notes
- Prometheus, Grafana, and Alertmanager integration

## Stack

Core services from [docker-compose.yml](/home/mihai/projects/opswatch/docker-compose.yml):

- `postgres` for state
- `redis` for queueing
- `migrate` for Alembic upgrades
- `api` for the FastAPI control plane
- `worker` for check execution
- `scheduler` for recurring jobs
- `prober` as a small probe-related scaffold
- `frontend` as an optional profile on `http://localhost:3001`

Observability comes from [docker-compose.observability.yml](/home/mihai/projects/opswatch/docker-compose.observability.yml):

- Prometheus
- Alertmanager
- Grafana
- a simple alert receiver

There is also a single-VM deploy path in [deploy/README.md](/home/mihai/projects/opswatch/deploy/README.md).

## Quick Start

Copy the example environment file and replace the placeholder secrets:

```bash
cp .env.example .env
```

The most important values are:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `OPSWATCH_API_KEY`

Set `OPSWATCH_API_KEY` in your real `.env` to a long random secret. The committed `.env.example` keeps placeholders only.

Start the core stack:

```bash
make showcase-up
```

That starts Postgres and Redis, runs Alembic, and only then starts the API, worker, and scheduler. It also injects build metadata so the footer can show version, commit, and build time.

Check readiness:

```bash
curl http://localhost:8000/ready
```

Seed realistic demo data into an empty database:

```bash
make demo-seed
```

Start the frontend:

```bash
make frontend-up
```

Open:

- API docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:3001`
- Ready check: `http://localhost:8000/ready`

## Demo Flow

For a clean showcase run from scratch:

```bash
cp .env.example .env
make showcase-up
make frontend-up
curl http://localhost:8000/ready
make demo-seed
```

The seeded dataset gives you:

- one healthy service
- one open incident
- one acknowledged incident with timeline history
- one maintenance window
- enough run history to populate charts
- audit records for seeded actions

If you want the observability layer too:

```bash
make showcase-obs-up
make frontend-up
```

Useful observability URLs:

- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Grafana: `http://localhost:3000`
- Alert receiver: `http://localhost:8088`

## Auth Model

Read routes are public in `0.2.0`.

Mutating routes require the `X-API-Key` header and are checked against `OPSWATCH_API_KEY`.

Protected actions include:

- monitor create, update, delete
- manual run enqueue
- maintenance create and delete
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

Local development keeps build metadata optional. If commit and build time are not injected, the dashboard footer falls back cleanly to just the API version.

Showcase and CI runs inject:

- `APP_COMMIT` from the current git SHA
- `APP_BUILT_AT` from a UTC timestamp

That is handled for you by `make showcase-up` and `make showcase-obs-up`.

## Deployment

The repo also includes a production-like single-VM deployment path with:

- GHCR image publishing
- Caddy in front of the API and Grafana
- separate deploy compose files
- an explicit migration step
- backup, restore, and validation scripts

Start with [deploy/README.md](/home/mihai/projects/opswatch/deploy/README.md) if you want to run OpsWatch outside the local development stack.

## Release Checks

Before calling a release good, these are the checks that matter most:

```bash
uvx ruff check --config ruff.toml --ignore B008 .
uvx ruff format --config ruff.toml --check .
uvx pytest -q -s
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

And for the real boot path:

```bash
docker compose up -d --build postgres redis migrate api worker scheduler
curl http://localhost:8000/ready
make demo-seed
docker compose down -v
```

## Useful Commands

```bash
make up
make showcase-up
make showcase-obs-up
make frontend-up
make demo-seed
make down
make clean
make ci
```

If you want more detail, the API surface is easiest to explore through `http://localhost:8000/docs`.
