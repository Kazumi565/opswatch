# OpsWatch

OpsWatch is a local-first monitoring and incident platform built as a production-ops showcase.

It demonstrates the full operational loop:

`define monitor -> migrate -> schedule checks -> execute checks -> evaluate incidents -> acknowledge and track -> audit control-plane changes -> expose metrics -> visualize -> alert`

## What 0.3.0 Adds

- human authentication with server-issued `HttpOnly` session cookies
- fixed roles: `user`, `programmer`, `admin`
- protected dashboard routes and authenticated read APIs
- backend role enforcement for every control-plane action
- admin user management and bootstrap-first-admin flow
- audit coverage for auth and user-management changes
- lightweight CSRF protection on cookie-authenticated mutating routes
- expired-session cleanup during normal auth flow
- all `0.2.0` monitoring, incident, maintenance, audit, and ownership features remain intact

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
- `OPSWATCH_AUTH_SECRET`

Optional values:

- `OPSWATCH_API_KEY` for admin automation scripts that still use `X-API-Key`
- `OPSWATCH_SESSION_TTL_HOURS` to shorten or extend session lifetime
- `OPSWATCH_AUTH_COOKIE_SECURE=false` for local HTTP dev, `true` behind HTTPS

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

### 5. Bootstrap the first admin

```bash
make create-admin ARGS='--email admin@example.com --display-name "Ops Admin"'
```

The command prompts for a password if you do not pass `--password`. It only succeeds when no users exist yet.

### 6. Start the frontend and log in

```bash
docker compose --profile frontend up -d frontend
```

Open `http://localhost:3001/login` and sign in with the admin you just created.

## Demo From Fresh Clone

### Core demo path

```bash
cp .env.example .env
make showcase-up
curl http://localhost:8000/ready
make demo-seed
make create-admin ARGS='--email admin@example.com --display-name "Ops Admin" --password change-me-now'
docker compose --profile frontend up -d frontend
```

Open:

- API docs: `http://localhost:8000/docs`
- Frontend login: `http://localhost:3001/login`
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

## Auth Overview

OpsWatch `0.3.0` uses DB-backed opaque sessions for human access:

- `POST /api/auth/login` validates email/password, sets `opswatch_session`, and returns the current user
- `POST /api/auth/logout` revokes the current session and clears cookies
- `GET /api/auth/me` returns the active identity and role
- browser auth uses `HttpOnly` cookies, not `localStorage`
- mutating cookie-authenticated requests must include `X-CSRF-Token` matching the `opswatch_csrf` cookie
- expired sessions are cleaned up opportunistically during normal auth checks

`OPSWATCH_API_KEY` can still be set as an optional admin automation/bootstrap path for non-browser callers. It is no longer the primary human auth model.

Public endpoints remain intentionally small:

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /ready`
- `GET /api/version`
- `GET /metrics`

Everything else requires authentication.

## Roles

### `user`

- can log in and view overview, monitors, incidents, checks, history, and profile/session info
- cannot acknowledge incidents
- cannot add incident notes
- cannot trigger manual runs
- cannot create or delete maintenance windows
- cannot manage monitors
- cannot manage users
- cannot read audit logs

### `programmer`

- can do everything a `user` can do
- can acknowledge incidents
- can add incident notes
- can trigger manual runs
- can create maintenance windows
- can delete maintenance windows
- cannot edit maintenance windows in `0.3.0`
- cannot manage monitors
- cannot manage users or roles
- cannot read audit logs

### `admin`

- can do everything a `programmer` can do
- can create, update, and delete monitors
- can list, create, update, activate, deactivate, and re-role users
- can read audit logs
- can use optional API-key admin automation

Safety rules enforced on the backend:

- inactive users cannot log in
- admins cannot deactivate themselves
- admins cannot demote themselves out of `admin`
- the last active admin cannot be deactivated or demoted

## Permission Matrix

- read APIs and dashboard pages: authenticated `user` or higher
- incident acknowledge: `programmer` or `admin`
- incident notes: `programmer` or `admin`
- manual run enqueue: `programmer` or `admin`
- maintenance create/delete: `programmer` or `admin`
- maintenance edit: not implemented in `0.3.0`
- monitor create/update/delete: `admin`
- audit log read: `admin`
- user list/create/update/role/active changes: `admin`

## Local Dev Auth Flow

1. Start the stack with `make up`.
2. Create the first admin with `make create-admin`.
3. Start the frontend with `make frontend-up` or `docker compose --profile frontend up -d frontend`.
4. Visit `http://localhost:3001/login`.
5. Sign in with the bootstrap admin.
6. Use the `Users` page to create `user` and `programmer` accounts for role testing.

For local API calls made with a browser session, first log in through `/api/auth/login` and then send the `X-CSRF-Token` header on mutating requests. For automation or smoke scripts, you may instead use `X-API-Key` when `OPSWATCH_API_KEY` is configured.

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
- Caddy TLS ingress in front of the API and frontend
- explicit `deploy-migrate` before `deploy-up`
- `OPSWATCH_AUTH_SECRET` for session and CSRF signing
- `OPSWATCH_AUTH_COOKIE_SECURE=true` for HTTPS
- bootstrap the first admin with `make deploy-create-admin`
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

### Auth and users

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/{user_id}`

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

Run these before calling `0.3.0` shippable:

```bash
uvx ruff check --config ruff.toml --ignore B008 .
uvx ruff format --config ruff.toml --check .
uv run --isolated --with-requirements app/requirements.txt --with-requirements worker/requirements.txt --with pytest pytest -q -s
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

Smoke the real boot path:

```bash
docker compose up -d --build postgres redis migrate api worker scheduler
curl http://localhost:8000/ready
make create-admin ARGS='--email admin@example.com --display-name "Ops Admin" --password change-me-now'
docker compose --profile frontend up -d frontend
docker compose down -v
```

Expected signals:

- API does not become ready before migrations are at head
- bootstrap admin creation works only on a fresh userless database
- login succeeds through `/api/auth/login` and the frontend login page
- read routes reject unauthenticated access
- `user` remains read-only
- `programmer` can acknowledge, note, enqueue runs, and create/delete maintenance
- `admin` can additionally manage monitors, users, and audit
- mutating cookie-authenticated routes reject missing or invalid CSRF tokens
- audit log records auth and admin-management history

## Helper Commands

The root [Makefile](/home/mihai/projects/opswatch/Makefile) proxies to [scripts/makefile](/home/mihai/projects/opswatch/scripts/makefile).

Useful targets:

```bash
make up
make showcase-up
make down
make clean
make demo-seed
make create-admin ARGS='--email admin@example.com --display-name "Ops Admin"'
make obs-up
make obs-up-dev-fast
make frontend-install
make frontend-test
make frontend-build
make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-create-admin DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env ARGS='--email admin@example.com --display-name "Ops Admin"'
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make ci
```
