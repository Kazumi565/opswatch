# OpsWatch Operational Runbook

## Daily Checks

Run from repo root on VM:

```bash
make deploy-ps DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

Verify:

- `https://<domain>/health/live` returns `{"status":"ok"}`
- `https://<domain>/health/ready` has `"ready": true`
- `/api/version` matches expected release tag

## Incident Triage

1. Check component health:

```bash
make deploy-logs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

2. Check API readiness payload:

```bash
curl -sS https://<domain>/health/ready
```

3. If queue flow is degraded (`redis` down in readiness payload), inspect Redis + worker + scheduler containers.
   API reads remain available when DB is healthy, but queue-backed operations will fail until Redis recovers.

4. For observability (localhost-bound), use SSH tunnel and inspect:
- Grafana `http://localhost:3000`
- Prometheus `http://localhost:9090`
- Alertmanager `http://localhost:9093`

## Planned Deploy

```bash
make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

Migrations are explicit by design. Keep migration failures isolated from service startup.

## Backup Policy

- Format: `pg_dump -Fc` custom dumps (`.dump`)
- Default schedule: daily
- Default retention: 14 days
- Default path: `/var/backups/opswatch`

Manual backup:

```bash
make deploy-backup DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

## Restore Procedure

```bash
make deploy-restore \
  DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env \
  BACKUP_FILE=/var/backups/opswatch/opswatch-<timestamp>.dump
```

Behavior:

- Stops API/worker/scheduler/frontend/caddy first.
- Recreates DB and restores with `pg_restore`.
- Requires explicit `deploy-migrate` afterward when target release expects newer schema.

## Rollback Procedure

1. Set `OPSWATCH_IMAGE_TAG` to the previous known-good release in `/etc/opswatch/opswatch.env`.
2. If schema incompatibility is possible, restore a backup aligned with that release.
3. Re-deploy and validate:

```bash
make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env
```

4. Confirm `/api/version` and dashboard behavior.

## systemd Operations

After installing `deploy/systemd/opswatch.service`:

```bash
sudo systemctl status opswatch
sudo systemctl restart opswatch
sudo journalctl -u opswatch -f
```

Unit is `oneshot` with `RemainAfterExit=yes`; Docker handles container restarts.

To auto-start observability profile on boot, set:

```bash
sudo cp deploy/systemd/opswatch.systemd.env.example /etc/opswatch/opswatch.systemd.env
sudo systemctl restart opswatch
```
