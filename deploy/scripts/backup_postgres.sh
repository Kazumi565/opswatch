#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${OPSWATCH_ENV_FILE:-${REPO_ROOT}/deploy/.env.vm}"
PROJECT_NAME="${OPSWATCH_PROJECT_NAME:-opswatch}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/opswatch}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ -z "${POSTGRES_DB:-}" || -z "${POSTGRES_USER:-}" ]]; then
  echo "POSTGRES_DB and POSTGRES_USER are required in ${ENV_FILE}" >&2
  exit 1
fi

if [[ -z "${BACKUP_DIR}" || "${BACKUP_DIR}" == "/" ]]; then
  echo "BACKUP_DIR must be a non-root path" >&2
  exit 1
fi

if ! [[ "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [[ "${BACKUP_RETENTION_DAYS}" -lt 1 ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/opswatch-${timestamp}.dump"

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  up -d postgres >/dev/null

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc >"${backup_file}"

find "${BACKUP_DIR}" -type f -name "opswatch-*.dump" -mtime +"${BACKUP_RETENTION_DAYS}" -delete

echo "Backup created: ${backup_file}"
echo "Format: pg_dump custom format (-Fc)"
