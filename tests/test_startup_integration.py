from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
WORKER_DIR = ROOT / "worker"

for path in (APP_DIR, WORKER_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


def purge_modules(prefixes: list[str]) -> None:
    for name in list(sys.modules):
        if any(name == prefix or name.startswith(f"{prefix}.") for prefix in prefixes):
            sys.modules.pop(name, None)


def set_runtime_env(monkeypatch: pytest.MonkeyPatch, database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("OPSWATCH_AUTH_SECRET", "integration-secret")
    monkeypatch.setenv("OPSWATCH_API_KEY", "integration-api-key")


def reset_opswatch_metrics() -> None:
    try:
        from prometheus_client import REGISTRY
    except Exception:
        return

    for collector, names in list(REGISTRY._collector_to_names.items()):
        if any(name.startswith("opswatch_http_request") for name in names):
            REGISTRY.unregister(collector)


def run_migrations(monkeypatch: pytest.MonkeyPatch, database_url: str) -> None:
    set_runtime_env(monkeypatch, database_url)
    purge_modules(["config", "models"])

    config = Config(str(APP_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(APP_DIR / "migrations"))
    command.upgrade(config, "head")


def load_app_module(monkeypatch: pytest.MonkeyPatch, database_url: str):
    set_runtime_env(monkeypatch, database_url)
    purge_modules(
        [
            "main",
            "config",
            "db",
            "deps",
            "models",
            "routes",
            "security",
            "audit_log",
            "payloads",
            "create_admin",
        ]
    )
    reset_opswatch_metrics()
    return importlib.import_module("main")


def load_models_module(monkeypatch: pytest.MonkeyPatch, database_url: str):
    set_runtime_env(monkeypatch, database_url)
    purge_modules(["config", "models"])
    return importlib.import_module("models")


def load_worker_jobs(monkeypatch: pytest.MonkeyPatch, database_url: str):
    set_runtime_env(monkeypatch, database_url)
    purge_modules(["opswatch_worker"])
    return importlib.import_module("opswatch_worker.jobs")


def load_create_admin(monkeypatch: pytest.MonkeyPatch, database_url: str):
    set_runtime_env(monkeypatch, database_url)
    purge_modules(["create_admin"])
    return importlib.import_module("create_admin")


def test_empty_db_migrations_and_live_worker_boot_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'opswatch.db'}"
    run_migrations(monkeypatch, database_url)

    models = load_models_module(monkeypatch, database_url)
    engine = create_engine(database_url)
    inspector = inspect(engine)

    expected_tables = set(models.Base.metadata.tables)
    actual_tables = set(inspector.get_table_names())
    assert expected_tables.issubset(actual_tables)
    for table_name, table in models.Base.metadata.tables.items():
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        expected_columns = {column.name for column in table.columns}
        assert actual_columns == expected_columns

    app_main = load_app_module(monkeypatch, database_url)
    monkeypatch.setattr(app_main, "check_redis_ready", lambda: None)

    enqueued: dict[str, int | str] = {}

    class FakeRedis:
        @classmethod
        def from_url(cls, url: str):
            return object()

    class FakeQueue:
        def __init__(self, *_args, **_kwargs):
            pass

        def enqueue(self, job_path: str, monitor_id: int):
            enqueued["job_path"] = job_path
            enqueued["monitor_id"] = monitor_id
            return SimpleNamespace(id="job-integration-1")

    monkeypatch.setattr(app_main, "Redis", FakeRedis)
    monkeypatch.setattr(app_main, "Queue", FakeQueue)

    with TestClient(app_main.app) as client:
        ready_response = client.get("/ready")
        assert ready_response.status_code == 200

        create_admin = load_create_admin(monkeypatch, database_url)
        monkeypatch.setattr(
            create_admin,
            "parse_args",
            lambda: SimpleNamespace(
                email="admin@opswatch.dev",
                display_name="Bootstrap Admin",
                password="bootstrap-password",
            ),
        )
        assert create_admin.main() == 0

        login_response = client.post(
            "/api/auth/login",
            json={"email": "admin@opswatch.dev", "password": "bootstrap-password"},
        )
        assert login_response.status_code == 200
        csrf_header = {"X-CSRF-Token": client.cookies.get("opswatch_csrf", "")}

        create_response = client.post(
            "/api/monitors",
            headers=csrf_header,
            json={
                "name": "integration-dns-failure",
                "type": "dns",
                "service": "dns",
                "environment": "prod",
                "owner": "platform@opswatch.dev",
                "severity": "critical",
                "runbook_url": "https://runbooks.example.com/dns",
                "target": "https://not-a-hostname",
                "interval_seconds": 60,
                "timeout_seconds": 1,
                "incident_threshold": 1,
                "retries": 0,
                "enabled": True,
            },
        )
        assert create_response.status_code == 201
        monitor_id = create_response.json()["id"]

        enqueue_response = client.post(
            f"/api/monitors/{monitor_id}/run",
            headers=csrf_header,
        )
        assert enqueue_response.status_code == 202
        assert enqueued == {
            "job_path": "opswatch_worker.jobs.run_check",
            "monitor_id": monitor_id,
        }

    worker_jobs = load_worker_jobs(monkeypatch, database_url)
    worker_jobs.run_check(monitor_id)

    with Session(engine) as db:
        runs = list(
            db.scalars(
                select(models.CheckRun)
                .where(models.CheckRun.monitor_id == monitor_id)
                .order_by(models.CheckRun.id)
            ).all()
        )
        incidents = list(
            db.scalars(
                select(models.Incident)
                .where(models.Incident.monitor_id == monitor_id)
                .order_by(models.Incident.id)
            ).all()
        )

    assert len(runs) == 1
    assert runs[0].success is False
    assert runs[0].attempts == 1
    assert runs[0].error is not None
    assert "dns target must be hostname only" in runs[0].error

    assert len(incidents) == 1
    assert incidents[0].state == "open"
    assert incidents[0].failure_count == 1
    assert incidents[0].service == "dns"
    assert "dns target must be hostname only" in (incidents[0].last_error or "")
