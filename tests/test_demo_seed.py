from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))


def purge_modules(prefixes: list[str]) -> None:
    for name in list(sys.modules):
        if any(name == prefix or name.startswith(f"{prefix}.") for prefix in prefixes):
            sys.modules.pop(name, None)


def set_runtime_env(monkeypatch: pytest.MonkeyPatch, database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("OPSWATCH_AUTH_SECRET", "demo-seed-secret")
    monkeypatch.setenv("OPSWATCH_API_KEY", "demo-seed-key")


def test_demo_seed_populates_realistic_dataset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'opswatch-demo.db'}"
    set_runtime_env(monkeypatch, database_url)
    purge_modules(["config", "db", "models", "demo_seed"])

    config = Config(str(APP_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(APP_DIR / "migrations"))
    command.upgrade(config, "head")

    demo_seed = importlib.import_module("demo_seed")
    models = importlib.import_module("models")

    with demo_seed.SessionLocal() as db:
        summary = demo_seed.seed_demo_data(db)

    engine = create_engine(database_url)
    with Session(engine) as db:
        monitors = list(db.scalars(select(models.Monitor).order_by(models.Monitor.id)).all())
        incidents = list(db.scalars(select(models.Incident).order_by(models.Incident.id)).all())
        runs = list(db.scalars(select(models.CheckRun).order_by(models.CheckRun.id)).all())
        maintenance_windows = list(
            db.scalars(select(models.MaintenanceWindow).order_by(models.MaintenanceWindow.id)).all()
        )
        audit_events = list(
            db.scalars(select(models.AuditEvent).order_by(models.AuditEvent.id)).all()
        )

    assert summary == {
        "monitors": 4,
        "open_incidents": 1,
        "acknowledged_incidents": 1,
        "maintenance_windows": 1,
    }
    assert len(monitors) == 4
    assert {incident.state for incident in incidents} == {"open", "acknowledged"}
    assert len(runs) == 48
    assert len(maintenance_windows) == 1
    assert len(audit_events) >= 7
