SHELL := /bin/bash
COMPOSE := docker compose
OBS_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability
OBS_DEV_FAST_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.observability.dev-fast.yml --profile observability

.PHONY: help up down restart ps logs api-logs worker-logs scheduler-logs build pull \
        lint fmt test ci reset-db clean volumes obs-up obs-down obs-up-dev-fast \
        frontend-up frontend-down frontend-install frontend-lint frontend-typecheck frontend-test frontend-build

help:
	@echo "OpsWatch Makefile"
	@echo ""
	@echo "Core stack:"
	@echo "  make up             Start core backend stack"
	@echo "  make down           Stop core backend stack"
	@echo "  make restart        Restart core backend stack"
	@echo ""
	@echo "Observability:"
	@echo "  make obs-up         Start backend + observability (standard rules)"
	@echo "  make obs-up-dev-fast Start backend + observability (dev-fast alert rules)"
	@echo "  make obs-down       Stop backend + observability stack"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend-up     Start frontend container profile (port 3001)"
	@echo "  make frontend-down   Stop frontend container profile"
	@echo "  make frontend-install Install npm dependencies in frontend/"
	@echo "  make frontend-lint   Run frontend lint"
	@echo "  make frontend-typecheck Run frontend typecheck"
	@echo "  make frontend-test   Run frontend tests"
	@echo "  make frontend-build  Build frontend"
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

reset-db:
	$(COMPOSE) down -v

clean:
	$(COMPOSE) down -v --remove-orphans
