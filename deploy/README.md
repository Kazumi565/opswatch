# OpsWatch Single-VM Deployment Guide

This guide defines the production path for OpsWatch on one Linux VM:

- Caddy handles public HTTPS ingress.
- API + frontend are publicly exposed only through Caddy.
- Postgres, Redis, Prometheus, Alertmanager, and Grafana are not publicly exposed by default.
- Deployments use pinned GHCR image tags (`OPSWATCH_IMAGE_TAG`).
- Database migrations run as an explicit one-off step.

## 1) Prerequisites

- Linux VM with Docker Engine + Compose plugin
- `make`, `bash`, `curl`
- Public DNS A record pointing your domain to the VM
- Ports 80/443 open to the VM

## 2) Prepare runtime env file

Copy the template and keep the real file outside git, for example:

```bash
sudo mkdir -p /etc/opswatch
sudo cp deploy/.env.vm.example /etc/opswatch/opswatch.env
sudo chmod 600 /etc/opswatch/opswatch.env
```

Set at minimum:

- `OPSWATCH_GHCR_OWNER`
- `OPSWATCH_IMAGE_TAG` (semver release tag, for example `v0.3.0`)
- `OPSWATCH_DOMAIN`
- `OPSWATCH_ACME_EMAIL`
- database/redis/auth values
- `OPSWATCH_AUTH_SECRET`
- `OPSWATCH_AUTH_COOKIE_SECURE=true`

Optional:

- `OPSWATCH_API_KEY` if you want the admin automation fallback for non-browser clients

## 3) GHCR authentication expectations

Images are pulled from `ghcr.io/<owner>/opswatch-*`.

- If packages are public: no login needed.
- If packages are private: authenticate on VM before deploy:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
```

Use a PAT with `read:packages` scope.

## 4) Deploy (explicit migration step)

Run from repository root on the VM:

```bash
make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

Notes:

- `deploy-migrate` is intentionally separate from `deploy-up`.
- `deploy-up` starts core stack (Caddy + API + worker + scheduler + frontend + Postgres + Redis).
- `deploy-up-obs` adds observability profile services.
- Bootstrap the first admin after the stack is up:

```bash
make deploy-create-admin DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env ARGS='--email admin@example.com --display-name "Ops Admin"'
```

For deployment runs that use the deploy compose files directly, the equivalent command is:

```bash
docker compose \
  --project-name opswatch \
  --env-file /etc/opswatch/opswatch.env \
  -f docker-compose.deploy.yml \
  exec api python create_admin.py --email admin@example.com --display-name "Ops Admin"
```

## 5) Access model

Public ingress:

- `https://<OPSWATCH_DOMAIN>/` -> frontend
- `https://<OPSWATCH_DOMAIN>/api/*` -> API
- `https://<OPSWATCH_DOMAIN>/health/live`
- `https://<OPSWATCH_DOMAIN>/health/ready`

Localhost-only on VM (for SSH tunneling):

- Grafana: `127.0.0.1:3000`
- Prometheus: `127.0.0.1:9090`
- Alertmanager: `127.0.0.1:9093`

Example tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 user@vm
```

## 6) Health semantics

- `GET /health/live`: process liveness only.
- `GET /health/ready`: dependency readiness with per-component status.
  - `database` is required for readiness.
  - `redis` is reported but non-blocking for readiness because core API read paths are DB-backed; Redis is required for enqueue and worker/scheduler flow.
  - Deploy compose intentionally does not gate API startup on Redis health for this reason.

## 7) Backups and restore

Backup format is **pg_dump custom format** (`-Fc`), file extension `.dump`.

Create backup:

```bash
make deploy-backup DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

Restore from backup:

```bash
make deploy-restore DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env BACKUP_FILE=/var/backups/opswatch/opswatch-<timestamp>.dump
```

Restore behavior:

- Script stops API/worker/scheduler/frontend/caddy before restore to avoid writes.
- Postgres stays up; DB is recreated and restored via `pg_restore`.
- After restore, run migrations explicitly for the target release if needed.

## 8) Automated daily backups

Create cron entry on VM:

```bash
sudo crontab -e
```

Example (daily at 02:30 UTC, keep 14 days via script):

```cron
30 2 * * * cd /opt/opswatch && OPSWATCH_ENV_FILE=/etc/opswatch/opswatch.env ./deploy/scripts/backup_postgres.sh >> /var/log/opswatch-backup.log 2>&1
```

## 9) systemd boot integration (oneshot)

Install unit:

```bash
sudo cp deploy/systemd/opswatch.service /etc/systemd/system/opswatch.service
sudo systemctl daemon-reload
sudo systemctl enable --now opswatch.service
```

Optional: start observability profile on boot by adding:

```bash
sudo cp deploy/systemd/opswatch.systemd.env.example /etc/opswatch/opswatch.systemd.env
```

Unit type is `oneshot` + `RemainAfterExit=yes`:

- systemd only runs compose up/down on boot/shutdown
- container restart behavior stays with Docker `restart` policies

## 10) Rollback

1. Identify prior good tag (for example `v0.1.9`).
2. Update `OPSWATCH_IMAGE_TAG=v0.1.9` in env file.
3. If rollback crosses schema boundaries:
   - Prefer restoring a backup from the matching timeframe.
   - Do not assume safe Alembic downgrade exists.
4. Re-run deployment commands:

```bash
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

5. Verify `/api/version` shows expected tag metadata.
