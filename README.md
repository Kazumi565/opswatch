# OpsWatch

OpsWatch is a self-hosted uptime monitoring and incident tracking platform designed to run on a single machine using Docker Compose. It supports HTTP, TCP, and DNS checks, retry logic, automatic incident handling, and maintenance window enforcement.

The system is intentionally simple: no Kubernetes, no external dependencies beyond Postgres and Redis, and everything runs locally in containers.

---

## Features

* HTTP, TCP, and DNS monitoring
* Configurable retries per monitor
* Optional HTTP keyword validation
* Check run history with duration, attempts, status code, and error details
* Automatic incident open/resolve logic
* Per-monitor failure thresholds
* Maintenance windows with enforcement rules
* Status and overview aggregation endpoints

---

## Architecture

Single-node deployment using Docker Compose.

```
                +-------------------+
                |      FastAPI      |
                |        API        |
                +---------+---------+
                          |
                          | CRUD + read endpoints
                          v
+-------------------+  writes/reads  +-------------------+
|      Worker       |<-------------->|     Postgres      |
|    (RQ worker)    |                | monitors / runs   |
+---------+---------+                +-------------------+
          ^
          | jobs (Redis queue: checks)
          |
+---------+---------+        enqueues due checks        +-------------------+
|    Scheduler      |---------------------------------> |       Redis       |
|   (polling loop)  |                                   |      queues       |
+-------------------+                                   +-------------------+
```

### Execution Flow

1. The scheduler polls Postgres for monitors that are due.
2. Due checks are enqueued into Redis (queue: `checks`).
3. The worker executes the check and writes a `check_runs` record.
4. After each run, the incident engine evaluates whether to open or resolve an incident.

---

## Services

Defined in `docker-compose.yml`:

* **postgres** (Postgres 16)
* **redis** (Redis 7)
* **api** (FastAPI)
* **worker** (RQ worker)
* **scheduler** (database polling scheduler)
* **prober** (placeholder service)

---

## Quickstart

### Requirements

* Docker
* Docker Compose

### Start the stack

```bash
docker compose up -d --build
```

### Verify

```bash
curl http://localhost:8000/health
```

API documentation is available at:

* [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Monitoring Model

Each monitor includes:

* `type`: `http`, `tcp`, or `dns`
* `target`: URL, `host:port`, or hostname
* `interval_seconds`
* `timeout_seconds`
* `retries`
* `incident_threshold`
* `http_keyword` (optional)
* `enabled`

### HTTP Checks

* Considered successful if `200 <= status < 400`
* If `http_keyword` is defined, the response body must contain it

### TCP Checks

* Attempts to open a socket connection to `host:port`

### DNS Checks

* Resolves hostname using `socket.getaddrinfo`
* Enforces a timeout to prevent blocking workers

---

## Incident Handling

Incidents have a minimal lifecycle:

* `open`
* `resolved`

An incident opens when consecutive failures reach the configured threshold. It resolves automatically on the next successful run.

### Maintenance Behavior

While a maintenance window is active:

* Open incidents are automatically resolved
* New incidents are not opened

Status aggregation accounts for maintenance windows when calculating overall system state.

---

## API Overview

### Health

* `GET /health`

### Monitors

* `POST /api/monitors`
* `GET /api/monitors`
* `GET /api/monitors/{id}`
* `PATCH /api/monitors/{id}`
* `DELETE /api/monitors/{id}`

### Manual Check

* `POST /api/monitors/{id}/run`

### Runs

* `GET /api/monitors/{id}/runs`
* `GET /api/runs/{run_id}`

### Incidents

* `GET /api/incidents`
* `GET /api/incidents/open`
* `GET /api/incidents/{incident_id}`

### Status and Stats

* `GET /api/status`
* `GET /api/overview`
* `GET /api/stats/overview`
* `GET /api/monitors/{id}/stats`

### Maintenance

* `POST /api/maintenance`
* `GET /api/maintenance`
* `DELETE /api/maintenance/{id}`

---

## Development

Linting, formatting, and tests:

```bash
uvx ruff check .
uvx ruff format --check .
uvx pytest -q
```

CI runs on each push and pull request and includes:

* Lint and format checks
* Tests
* Docker build
* Vulnerability scan (report-only)

---

## Notes

* Worker enqueue target must remain `opswatch_worker.jobs.run_check`
* `.env` is not committed (see `.env.example`)
* Containers may need to be recreated after structural changes

---

## Roadmap

* Improve test coverage (incident and maintenance logic)
* Add metrics endpoint and Prometheus integration
* Provide a minimal status page UI
* Infrastructure as Code deployment example

---

## License

TBD
