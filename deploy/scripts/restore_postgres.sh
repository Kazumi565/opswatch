#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${OPSWATCH_ENV_FILE:-${REPO_ROOT}/deploy/.env.vm}"
PROJECT_NAME="${OPSWATCH_PROJECT_NAME:-opswatch}"
BACKUP_FILE="${OPSWATCH_BACKUP_FILE:-${1:-}}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: OPSWATCH_BACKUP_FILE=/path/to/opswatch-YYYYMMDDTHHMMSSZ.dump $0" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${POSTGRES_DB:-}" || -z "${POSTGRES_USER:-}" ]]; then
  echo "POSTGRES_DB and POSTGRES_USER are required in ${ENV_FILE}" >&2
  exit 1
fi

echo "Stopping write-path services before restore..."
docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  stop api worker scheduler frontend caddy prober || true

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  up -d postgres >/dev/null

echo "Recreating database ${POSTGRES_DB}..."
docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  exec -T postgres dropdb -U "${POSTGRES_USER}" --if-exists "${POSTGRES_DB}"

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  exec -T postgres createdb -U "${POSTGRES_USER}" "${POSTGRES_DB}"

echo "Restoring from ${BACKUP_FILE}..."
cat "${BACKUP_FILE}" | docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  exec -T postgres pg_restore \
    --format=custom \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges

echo "Restore completed. Run migrations explicitly if the release code expects newer schema:"
echo "  make deploy-migrate DEPLOY_ENV_FILE=${ENV_FILE}"
echo "Then start the stack:"
echo "  make deploy-up DEPLOY_ENV_FILE=${ENV_FILE}"
