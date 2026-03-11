#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${OPSWATCH_ENV_FILE:-${REPO_ROOT}/deploy/.env.vm}"
PROJECT_NAME="${OPSWATCH_PROJECT_NAME:-opswatch}"

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "${PYTHON_BIN}" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Missing Python interpreter (python3/python) required for JSON validation" >&2
    exit 1
  fi
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${OPSWATCH_DOMAIN:-}" ]]; then
  echo "OPSWATCH_DOMAIN is required in ${ENV_FILE}" >&2
  exit 1
fi

base_url="https://${OPSWATCH_DOMAIN}"

echo "Checking core services are running..."
services_output="$(docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file "${ENV_FILE}" \
  -f "${REPO_ROOT}/docker-compose.deploy.yml" \
  ps --services --status running)"

echo "${services_output}"

required_services=(caddy postgres redis api worker scheduler frontend)
for service_name in "${required_services[@]}"; do
  if ! grep -Fxq "${service_name}" <<<"${services_output}"; then
    echo "Required service is not running: ${service_name}" >&2
    exit 1
  fi
done

echo "Checking public endpoints..."
live_body="$(curl --fail --silent --show-error "${base_url}/health/live")"
ready_body="$(curl --fail --silent --show-error "${base_url}/health/ready")"
version_body="$(curl --fail --silent --show-error "${base_url}/api/version")"
status_body="$(curl --fail --silent --show-error "${base_url}/api/status")"

"${PYTHON_BIN}" - "$live_body" "$ready_body" "$version_body" "$status_body" <<'PY'
import json
import sys

live = json.loads(sys.argv[1])
ready = json.loads(sys.argv[2])
version = json.loads(sys.argv[3])
status = json.loads(sys.argv[4])

assert live.get("status") == "ok", f"unexpected /health/live: {live}"
assert ready.get("ready") is True, f"unexpected /health/ready: {ready}"
for key in ("version", "commit", "built_at"):
    assert key in version and isinstance(version[key], str) and version[key], f"missing {key}: {version}"
assert "overall" in status, f"unexpected /api/status: {status}"
print("Validation checks passed.")
PY
