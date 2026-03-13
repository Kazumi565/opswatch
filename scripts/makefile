SHELL := /bin/bash
COMPOSE := docker compose
OBS_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability
OBS_DEV_FAST_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.observability.dev-fast.yml --profile observability
DEPLOY_ENV_FILE ?= deploy/.env.vm
DEPLOY_PROJECT ?= opswatch
DEPLOY_COMPOSE := docker compose --project-name $(DEPLOY_PROJECT) --env-file $(DEPLOY_ENV_FILE) -f docker-compose.deploy.yml
DEPLOY_OBS_COMPOSE := docker compose --project-name $(DEPLOY_PROJECT) --env-file $(DEPLOY_ENV_FILE) -f docker-compose.deploy.yml -f docker-compose.deploy.observability.yml --profile observability
BUILD_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_UTC := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_METADATA_ENV := APP_COMMIT=$(BUILD_COMMIT) APP_BUILT_AT=$(BUILD_UTC)

.PHONY: help up down restart ps logs api-logs worker-logs scheduler-logs build pull \
        lint fmt test ci reset-db clean volumes obs-up obs-down obs-up-dev-fast showcase-up showcase-obs-up \
        frontend-up frontend-down frontend-install frontend-lint frontend-typecheck frontend-test frontend-build \
        demo-seed deploy-up deploy-up-obs deploy-down deploy-down-obs deploy-ps deploy-logs deploy-migrate \
        deploy-validate deploy-backup deploy-restore

help:
	@echo "OpsWatch Makefile"
	@echo ""
	@echo "Core stack:"
	@echo "  make up             Start core backend stack"
	@echo "  make showcase-up    Start core stack with injected git/build metadata"
	@echo "  make down           Stop core backend stack"
	@echo "  make restart        Restart core backend stack"
	@echo ""
	@echo "Observability:"
	@echo "  make obs-up         Start backend + observability (standard rules)"
	@echo "  make showcase-obs-up Start backend + observability with injected git/build metadata"
	@echo "  make obs-up-dev-fast Start backend + observability (dev-fast alert rules)"
	@echo "  make obs-down       Stop backend + observability stack"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-migrate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env  Run alembic upgrade head (explicit one-off)"
	@echo "  make deploy-up DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env       Start core deploy stack"
	@echo "  make deploy-up-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env   Start core + observability deploy stack"
	@echo "  make deploy-down DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env     Stop core deploy stack"
	@echo "  make deploy-down-obs DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env Stop core + observability deploy stack"
	@echo "  make deploy-validate DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env Validate live deployment endpoints"
	@echo "  make deploy-backup DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env   Create pg_dump custom backup"
	@echo "  make deploy-restore DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env BACKUP_FILE=/var/backups/opswatch/<file>.dump"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend-up     Start frontend container profile (port 3001)"
	@echo "  make frontend-down   Stop frontend container profile"
	@echo "  make frontend-install Install npm dependencies in frontend/"
	@echo "  make frontend-lint   Run frontend lint"
	@echo "  make frontend-typecheck Run frontend typecheck"
	@echo "  make frontend-test   Run frontend tests"
	@echo "  make frontend-build  Build frontend"
	@echo "  make demo-seed       Seed realistic demo data into an empty database"
	@echo ""
	@echo "Logs:"
	@echo "  make logs            Follow logs (all core services)"
	@echo "  make api-logs        Follow API logs"
	@echo "  make worker-logs     Follow worker logs"
	@echo "  make scheduler-logs  Follow scheduler logs"
	@echo ""
	@echo "Python quality:"
	@echo "  make lint            Ruff lint"
	@echo "  make fmt             Ruff format"
	@echo "  make test            Pytest"
	@echo "  make ci              Ruff + format-check + pytest"
	@echo ""
	@echo "Danger zone:"
	@echo "  make reset-db        Stop stack and remove DB/Redis volumes"
	@echo "  make clean           Remove containers + volumes"

up:
	$(COMPOSE) up -d --build

showcase-up:
	$(BUILD_METADATA_ENV) $(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) down
	$(COMPOSE) up -d --build

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

api-logs:
	$(COMPOSE) logs -f --tail=200 api

worker-logs:
	$(COMPOSE) logs -f --tail=200 worker

scheduler-logs:
	$(COMPOSE) logs -f --tail=200 scheduler

build:
	$(COMPOSE) build --pull

pull:
	$(COMPOSE) pull

lint:
	uvx ruff check --config ruff.toml --ignore B008 .

fmt:
	uvx ruff format --config ruff.toml .

test:
	uvx pytest -q

ci:
	uvx ruff check --config ruff.toml --ignore B008 .
	uvx ruff format --config ruff.toml --check .
	uvx pytest -q

obs-up:
	$(OBS_COMPOSE) up -d --build

showcase-obs-up:
	$(BUILD_METADATA_ENV) $(OBS_COMPOSE) up -d --build

obs-up-dev-fast:
	$(OBS_DEV_FAST_COMPOSE) up -d --build

obs-down:
	$(OBS_COMPOSE) down

frontend-up:
	$(COMPOSE) --profile frontend up -d frontend

frontend-down:
	$(COMPOSE) --profile frontend down

frontend-install:
	npm --prefix frontend install

frontend-lint:
	npm --prefix frontend run lint

frontend-typecheck:
	npm --prefix frontend run typecheck

frontend-test:
	npm --prefix frontend run test

frontend-build:
	npm --prefix frontend run build

deploy-up:
	$(DEPLOY_COMPOSE) up -d

deploy-up-obs:
	$(DEPLOY_OBS_COMPOSE) up -d

deploy-down:
	$(DEPLOY_COMPOSE) down

deploy-down-obs:
	$(DEPLOY_OBS_COMPOSE) down

deploy-ps:
	$(DEPLOY_COMPOSE) ps

deploy-logs:
	$(DEPLOY_COMPOSE) logs -f --tail=200

deploy-migrate:
	$(DEPLOY_COMPOSE) --profile tools run --rm migrate

deploy-validate:
	OPSWATCH_ENV_FILE="$(DEPLOY_ENV_FILE)" OPSWATCH_PROJECT_NAME="$(DEPLOY_PROJECT)" ./deploy/scripts/validate_deploy.sh

deploy-backup:
	OPSWATCH_ENV_FILE="$(DEPLOY_ENV_FILE)" OPSWATCH_PROJECT_NAME="$(DEPLOY_PROJECT)" ./deploy/scripts/backup_postgres.sh

deploy-restore:
	@test -n "$(BACKUP_FILE)" || (echo "Usage: make deploy-restore DEPLOY_ENV_FILE=/etc/opswatch/opswatch.env BACKUP_FILE=/path/to/opswatch-*.dump"; exit 1)
	OPSWATCH_ENV_FILE="$(DEPLOY_ENV_FILE)" OPSWATCH_PROJECT_NAME="$(DEPLOY_PROJECT)" OPSWATCH_BACKUP_FILE="$(BACKUP_FILE)" ./deploy/scripts/restore_postgres.sh

demo-seed:
	$(COMPOSE) exec -T api python demo_seed.py

reset-db:
	$(COMPOSE) down -v

clean:
	$(COMPOSE) down -v --remove-orphans
