from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402
from config import settings  # noqa: E402
from deps import get_db  # noqa: E402
from models import (  # noqa: E402
    AuditEvent,
    Base,
    CheckRun,
    Incident,
    IncidentEvent,
    MaintenanceWindow,
    Monitor,
    MonitorType,
)

AUTH_HEADERS = {"X-API-Key": settings.opswatch_api_key}


def utc_now() -> datetime:
    return datetime.now(UTC)


def build_monitor(*, name: str, monitor_type: MonitorType, target: str) -> Monitor:
    return Monitor(
        name=name,
        type=monitor_type,
        service=name.split("-")[0],
        environment="prod",
        owner=f"{name}@opswatch.dev",
        severity="high",
        runbook_url=f"https://runbooks.example.com/{name}",
        target=target,
        interval_seconds=60,
        timeout_seconds=5,
        incident_threshold=3,
        retries=0,
        enabled=True,
    )


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    session = session_local()
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
    monitor_1 = build_monitor(
        name="api-home",
        monitor_type=MonitorType.http,
        target="https://example.com",
    )
    monitor_2 = build_monitor(
        name="dns-core",
        monitor_type=MonitorType.dns,
        target="example.org",
    )
    db.add_all([monitor_1, monitor_2])
    db.flush()

    now = utc_now()
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


def seed_incident(db: Session, *, monitor: Monitor, state: str = "open") -> Incident:
    incident = Incident(
        monitor_id=monitor.id,
        state=state,
        opened_at=utc_now() - timedelta(minutes=20),
        resolved_at=None,
        failure_count=3,
        last_error="timeout",
        service=monitor.service,
        environment=monitor.environment,
        owner=monitor.owner,
        severity=monitor.severity,
        runbook_url=monitor.runbook_url,
    )
    db.add(incident)
    db.flush()
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            event_type="opened",
            actor="system",
            note=None,
            created_at=incident.opened_at,
        )
    )
    db.commit()
    return incident


def test_get_runs_orders_desc_and_clamps_limit(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)

    response = client.get("/api/runs", params={"limit": 0})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == seeded["r3"].id
    assert payload[0]["monitor_name"] == seeded["m2"].name

    response = client.get("/api/runs", params={"limit": 5000})
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [
        seeded["r3"].id,
        seeded["r2"].id,
        seeded["r1"].id,
    ]


def test_get_runs_filters_by_success_and_monitor(client: TestClient, db_session: Session):
    seeded = seed_runs(db_session)

    response = client.get("/api/runs", params={"success": "false"})
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [seeded["r2"].id]

    response = client.get("/api/runs", params={"monitor_id": seeded["m1"].id})
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [seeded["r2"].id, seeded["r1"].id]
    assert all(item["monitor_name"] == seeded["m1"].name for item in payload)

    response = client.get(
        "/api/runs",
        params={"monitor_id": seeded["m1"].id, "success": "true"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [seeded["r1"].id]


def test_get_runs_missing_monitor_returns_404(client: TestClient):
    response = client.get("/api/runs", params={"monitor_id": 9999})
    assert response.status_code == 404
    assert response.json()["detail"] == "Monitor not found"


def test_incident_routes_expose_state_timeline_and_snapshot_metadata(
    client: TestClient,
    db_session: Session,
):
    seeded = seed_runs(db_session)
    incident = seed_incident(db_session, monitor=seeded["m1"], state="open")

    list_response = client.get("/api/incidents/open")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload[0]["state"] == "open"
    assert list_payload[0]["service"] == seeded["m1"].service
    assert list_payload[0]["monitor_name"] == seeded["m1"].name

    detail_response = client.get(f"/api/incidents/{incident.id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["timeline"][0]["event_type"] == "opened"
    assert detail_payload["runbook_url"] == seeded["m1"].runbook_url


def test_status_and_summary_treat_acknowledged_incidents_as_active_but_maintenance_suppressed(
    client: TestClient,
    db_session: Session,
):
    seeded = seed_runs(db_session)
    incident = seed_incident(db_session, monitor=seeded["m1"], state="acknowledged")
    now = utc_now()
    db_session.add(
        MaintenanceWindow(
            monitor_id=seeded["m1"].id,
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(minutes=5),
            reason="deploy",
        )
    )
    db_session.commit()

    status_response = client.get("/api/status")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["overall"] == "degraded"
    assert status_payload["open_incidents"] == []

    summary_response = client.get("/api/summary")
    assert summary_response.status_code == 200
    summary_payload = summary_response.json()
    assert summary_payload["incidents"]["open_total"] == 1
    assert summary_payload["incidents"]["open_actionable"] == 0
    assert summary_payload["incidents"]["latest_total_open"][0]["state"] == incident.state
    assert summary_payload["incidents"]["latest_actionable_open"] == []


def test_health_is_shallow_and_ready_requires_migrations(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(main, "check_redis_ready", lambda: None)

    health_response = client.get("/health")
    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}

    ready_response = client.get("/ready")
    assert ready_response.status_code == 503
    assert "database not ready" in ready_response.json()["detail"]


def test_version_endpoint_returns_required_keys(client: TestClient):
    response = client.get("/api/version")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) == {"version", "commit", "built_at"}
    assert all(isinstance(payload[key], str) and payload[key] for key in payload)


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        (
            "post",
            "/api/monitors",
            {
                "name": "protected-http",
                "type": "http",
                "service": "edge",
                "environment": "prod",
                "owner": "platform@opswatch.dev",
                "severity": "high",
                "runbook_url": "https://runbooks.example.com/edge",
                "target": "https://example.com",
                "interval_seconds": 60,
                "timeout_seconds": 5,
                "incident_threshold": 3,
                "retries": 0,
                "enabled": True,
            },
        ),
        (
            "post",
            "/api/maintenance",
            {
                "monitor_id": None,
                "starts_at": utc_now().isoformat(),
                "ends_at": (utc_now() + timedelta(minutes=15)).isoformat(),
                "reason": "protected route test",
            },
        ),
    ],
)
def test_mutating_routes_require_api_key(
    client: TestClient,
    method: str,
    path: str,
    json_body: dict,
):
    response = getattr(client, method)(path, json=json_body)
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid or missing api key"


def test_monitor_create_update_enqueue_and_delete_are_audited(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    enqueued: dict[str, int | str] = {}

    class FakeRedis:
        @classmethod
        def from_url(cls, _url: str):
            return object()

    class FakeQueue:
        def __init__(self, *_args, **_kwargs):
            pass

        def enqueue(self, job_path: str, monitor_id: int):
            enqueued["job_path"] = job_path
            enqueued["monitor_id"] = monitor_id
            return SimpleNamespace(id="job-audit-1")

    monkeypatch.setattr(main, "Redis", FakeRedis)
    monkeypatch.setattr(main, "Queue", FakeQueue)

    create_response = client.post(
        "/api/monitors",
        headers=AUTH_HEADERS,
        json={
            "name": "audit-http",
            "type": "http",
            "service": "edge",
            "environment": "prod",
            "owner": "platform@opswatch.dev",
            "severity": "high",
            "runbook_url": "https://runbooks.example.com/edge",
            "target": "https://example.com",
            "interval_seconds": 60,
            "timeout_seconds": 5,
            "incident_threshold": 3,
            "retries": 0,
            "enabled": True,
        },
    )
    assert create_response.status_code == 201
    monitor_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/monitors/{monitor_id}",
        headers=AUTH_HEADERS,
        json={"owner": "sre@opswatch.dev", "severity": "critical"},
    )
    assert update_response.status_code == 200

    enqueue_response = client.post(
        f"/api/monitors/{monitor_id}/run",
        headers=AUTH_HEADERS,
    )
    assert enqueue_response.status_code == 202
    assert enqueued == {
        "job_path": "opswatch_worker.jobs.run_check",
        "monitor_id": monitor_id,
    }

    delete_response = client.delete(
        f"/api/monitors/{monitor_id}",
        headers=AUTH_HEADERS,
    )
    assert delete_response.status_code == 204

    audit_actions = [
        row.action for row in db_session.scalars(select(AuditEvent).order_by(AuditEvent.id)).all()
    ]
    assert audit_actions == [
        "monitor.create",
        "monitor.update",
        "monitor.run.enqueue",
        "monitor.delete",
    ]


def test_maintenance_mutations_are_audited(client: TestClient, db_session: Session):
    monitor = build_monitor(
        name="maintenance-api", monitor_type=MonitorType.http, target="https://example.com"
    )
    db_session.add(monitor)
    db_session.commit()

    create_response = client.post(
        "/api/maintenance",
        headers=AUTH_HEADERS,
        json={
            "monitor_id": monitor.id,
            "starts_at": utc_now().isoformat(),
            "ends_at": (utc_now() + timedelta(minutes=30)).isoformat(),
            "reason": "planned deploy",
        },
    )
    assert create_response.status_code == 201
    window_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/maintenance/{window_id}", headers=AUTH_HEADERS)
    assert delete_response.status_code == 204

    actions = [
        row.action
        for row in db_session.scalars(
            select(AuditEvent)
            .where(AuditEvent.resource_type == "maintenance_window")
            .order_by(AuditEvent.id)
        ).all()
    ]
    assert actions == ["maintenance.create", "maintenance.delete"]


def test_incident_acknowledge_and_notes_create_timeline_and_audit(
    client: TestClient,
    db_session: Session,
):
    monitor = build_monitor(
        name="checkout-api", monitor_type=MonitorType.http, target="https://example.com"
    )
    db_session.add(monitor)
    db_session.flush()
    incident = seed_incident(db_session, monitor=monitor, state="open")

    ack_response = client.post(f"/api/incidents/{incident.id}/ack", headers=AUTH_HEADERS)
    assert ack_response.status_code == 200
    ack_payload = ack_response.json()
    assert ack_payload["state"] == "acknowledged"
    assert [event["event_type"] for event in ack_payload["timeline"]] == ["opened", "acknowledged"]

    note_response = client.post(
        f"/api/incidents/{incident.id}/notes",
        headers=AUTH_HEADERS,
        json={"note": "Investigating packet loss on the checkout service."},
    )
    assert note_response.status_code == 200
    note_payload = note_response.json()
    assert note_payload["state"] == "acknowledged"
    assert [event["event_type"] for event in note_payload["timeline"]] == [
        "opened",
        "acknowledged",
        "note_added",
    ]
    assert (
        note_payload["timeline"][-1]["note"] == "Investigating packet loss on the checkout service."
    )

    actions = [
        row.action
        for row in db_session.scalars(
            select(AuditEvent).where(AuditEvent.resource_type == "incident").order_by(AuditEvent.id)
        ).all()
    ]
    assert actions == ["incident.acknowledge", "incident.note"]


def test_audit_api_filters(client: TestClient, db_session: Session):
    db_session.add_all(
        [
            AuditEvent(
                actor="api_key",
                action="monitor.create",
                resource_type="monitor",
                resource_id=11,
                summary_json={"name": "edge-api"},
            ),
            AuditEvent(
                actor="api_key",
                action="incident.acknowledge",
                resource_type="incident",
                resource_id=22,
                summary_json={"monitor_id": 11},
            ),
        ]
    )
    db_session.commit()

    filtered_response = client.get("/api/audit", params={"resource_type": "incident"})
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert len(filtered_payload) == 1
    assert filtered_payload[0]["action"] == "incident.acknowledge"

    by_id_response = client.get(
        "/api/audit", params={"resource_type": "monitor", "resource_id": 11}
    )
    assert by_id_response.status_code == 200
    by_id_payload = by_id_response.json()
    assert len(by_id_payload) == 1
    assert by_id_payload[0]["summary_json"]["name"] == "edge-api"


def test_health_live_returns_ok(client: TestClient):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_ready_returns_ready_when_db_ok_and_redis_ok(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
):
    monkeypatch.setattr(main, "_check_database", lambda: (True, "ok"), raising=True)
    monkeypatch.setattr(main, "_check_redis", lambda: (True, "ok"), raising=True)

    response = client.get("/health/ready")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is True
    assert payload["status"] == "ready"


def test_health_ready_returns_503_when_redis_down(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
):
    monkeypatch.setattr(main, "_check_database", lambda: (True, "ok"), raising=True)
    monkeypatch.setattr(main, "_check_redis", lambda: (False, "ConnectionError"), raising=True)

    response = client.get("/health/ready")
    assert response.status_code == 503
    payload = response.json()
    assert payload["ready"] is False
    assert payload["status"] == "degraded"


def test_health_ready_returns_503_when_db_down(monkeypatch: pytest.MonkeyPatch, client: TestClient):
    monkeypatch.setattr(main, "_check_database", lambda: (False, "OperationalError"), raising=True)
    monkeypatch.setattr(main, "_check_redis", lambda: (True, "ok"), raising=True)

    response = client.get("/health/ready")
    assert response.status_code == 503
    payload = response.json()
    assert payload["ready"] is False
    assert payload["status"] == "not_ready"
