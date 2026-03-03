SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help up down restart ps logs api-logs worker-logs scheduler-logs build pull \
        lint fmt test ci reset-db clean volumes

help:
	@echo "OpsWatch Makefile"
	@echo ""
	@echo "Common:"
	@echo "  make up           Start stack (build if needed)"
	@echo "  make down         Stop stack"
	@echo "  make restart      Restart stack"
	@echo "  make ps           Show container status"
	@echo "  make logs         Follow logs (all)"
	@echo ""
	@echo "Logs:"
	@echo "  make api-logs      Follow API logs"
	@echo "  make worker-logs   Follow worker logs"
	@echo "  make scheduler-logs Follow scheduler logs"
	@echo ""
	@echo "Dev:"
	@echo "  make lint         Ruff lint"
	@echo "  make fmt          Ruff format"
	@echo "  make test         Pytest"
	@echo "  make ci           Lint + format-check + test"
	@echo ""
	@echo "Danger zone:"
	@echo "  make reset-db     Stop and remove DB/Redis volumes (data loss)"
	@echo "  make clean        Remove containers + volumes (data loss)"

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

reset-db:
	$(COMPOSE) down -v

clean:
	$(COMPOSE) down -v --remove-orphans