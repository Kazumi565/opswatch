from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402
from deps import get_db  # noqa: E402
from models import Base, CheckRun, Incident, Monitor, MonitorType  # noqa: E402


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session):
    def override_get_db():
        yield db_session

    main.app.dependency_overrides[get_db] = override_get_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()


def seed_runs(db: Session):
    monitor_1 = Monitor(
        name="api-home",
        type=MonitorType.http,
        target="https://example.com",
        interval_seconds=60,
        timeout_seconds=5,
        incident_threshold=3,
        retries=0,
        enabled=True,
    )
    monitor_2 = Monitor(
        name="dns-core",
        type=MonitorType.dns,
        target="example.org",
        interval_seconds=60,
        timeout_seconds=5,
        incident_threshold=3,
        retries=0,
        enabled=True,
    )
    db.add_all([monitor_1, monitor_2])
    db.flush()

    now = datetime.now(UTC)
    run_1 = CheckRun(
        monitor_id=monitor_1.id,
        started_at=now - timedelta(minutes=5),
        duration_ms=180,
        attempts=1,
        success=True,
        status_code=200,
        error=None,
    )
    run_2 = CheckRun(
        monitor_id=monitor_1.id,
        started_at=now - timedelta(minutes=3),
        duration_ms=200,
        attempts=2,
        success=False,
        status_code=None,
        error="timeout",
    )
    run_3 = CheckRun(
        monitor_id=monitor_2.id,
        started_at=now - timedelta(minutes=1),
        duration_ms=95,
        attempts=1,
        success=True,
        status_code=None,
        error=None,
    )

    db.add_all([run_1, run_2, run_3])
    db.commit()
    return {
        "m1": monitor_1,
        "m2": monitor_2,
        "r1": run_1,
        "r2": run_2,
        "r3": run_3,
    }


def test_get_runs_orders_desc_and_clamps_limit(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)

    r = client.get("/api/runs", params={"limit": 0})
    assert r.status_code == 200
    payload = r.json()
    assert len(payload) == 1
    assert payload[0]["id"] == seeded["r3"].id
    assert payload[0]["monitor_name"] == seeded["m2"].name

    r = client.get("/api/runs", params={"limit": 5000})
    assert r.status_code == 200
    payload = r.json()
    assert [item["id"] for item in payload] == [
        seeded["r3"].id,
        seeded["r2"].id,
        seeded["r1"].id,
    ]


def test_get_runs_filters_by_success_and_monitor(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)

    r = client.get("/api/runs", params={"success": "false"})
    assert r.status_code == 200
    payload = r.json()
    assert [item["id"] for item in payload] == [seeded["r2"].id]

    r = client.get("/api/runs", params={"monitor_id": seeded["m1"].id})
    assert r.status_code == 200
    payload = r.json()
    assert [item["id"] for item in payload] == [seeded["r2"].id, seeded["r1"].id]
    assert all(item["monitor_name"] == seeded["m1"].name for item in payload)

    r = client.get(
        "/api/runs",
        params={"monitor_id": seeded["m1"].id, "success": "true"},
    )
    assert r.status_code == 200
    payload = r.json()
    assert [item["id"] for item in payload] == [seeded["r1"].id]


def test_get_runs_missing_monitor_returns_404(client: TestClient):
    r = client.get("/api/runs", params={"monitor_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Monitor not found"


def test_incidents_include_monitor_name(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)
    db_session.add(
        Incident(
            monitor_id=seeded["m1"].id,
            status="open",
            opened_at=datetime.now(UTC),
            resolved_at=None,
            failure_count=3,
            last_error="timeout",
        )
    )
    db_session.commit()

    r = client.get("/api/incidents/open")
    assert r.status_code == 200
    payload = r.json()
    assert payload[0]["monitor_id"] == seeded["m1"].id
    assert payload[0]["monitor_name"] == seeded["m1"].name


def test_status_open_incidents_include_monitor_name(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)
    db_session.add(
        Incident(
            monitor_id=seeded["m1"].id,
            status="open",
            opened_at=datetime.now(UTC),
            resolved_at=None,
            failure_count=3,
            last_error="timeout",
        )
    )
    db_session.commit()

    r = client.get("/api/status")
    assert r.status_code == 200
    payload = r.json()
    assert payload["open_incidents"][0]["monitor_name"] == seeded["m1"].name


def test_version_endpoint_returns_required_keys(client: TestClient):
    r = client.get("/api/version")
    assert r.status_code == 200
    payload = r.json()
    assert set(payload.keys()) == {"version", "commit", "built_at"}
    assert all(isinstance(payload[key], str) and payload[key] for key in payload)


def test_version_endpoint_reads_settings(monkeypatch: pytest.MonkeyPatch, client: TestClient):
    monkeypatch.setattr(main.settings, "app_version", "1.2.3", raising=False)
    monkeypatch.setattr(main.settings, "app_commit", "abc123", raising=False)
    monkeypatch.setattr(main.settings, "app_built_at", "2026-03-09T00:00:00Z", raising=False)

    r = client.get("/api/version")
    assert r.status_code == 200
    assert r.json() == {
        "version": "1.2.3",
        "commit": "abc123",
        "built_at": "2026-03-09T00:00:00Z",
    }
