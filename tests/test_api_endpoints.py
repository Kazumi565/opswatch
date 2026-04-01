from __future__ import annotations

import importlib
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
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
    monkeypatch.setenv("OPSWATCH_AUTH_SECRET", "test-auth-secret")
    monkeypatch.setenv("OPSWATCH_API_KEY", "test-api-key")


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


@pytest.fixture()
def app_runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'opswatch-test.db'}"
    run_migrations(monkeypatch, database_url)
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
    main = importlib.import_module("main")
    models = importlib.import_module("models")
    security = importlib.import_module("security")
    engine = create_engine(database_url)

    monkeypatch.setattr(main, "check_redis_ready", lambda: None)
    return SimpleNamespace(main=main, models=models, security=security, engine=engine)


@pytest.fixture()
def client(app_runtime) -> TestClient:
    with TestClient(app_runtime.main.app) as test_client:
        yield test_client


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_user(
    app_runtime,
    *,
    email: str,
    role: str,
    password: str = "password123",
    is_active: bool = True,
    display_name: str | None = None,
):
    models = app_runtime.models
    security = app_runtime.security
    user = models.User(
        email=email,
        display_name=display_name or email.split("@")[0].replace(".", " ").title(),
        password_hash=security.hash_password(password),
        role=models.UserRole(role),
        is_active=is_active,
    )
    with Session(app_runtime.engine) as db:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def build_monitor(app_runtime, *, name: str, monitor_type: str, target: str):
    models = app_runtime.models
    return models.Monitor(
        name=name,
        type=models.MonitorType(monitor_type),
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


def seed_monitor_bundle(app_runtime):
    models = app_runtime.models
    with Session(app_runtime.engine) as db:
        monitor = build_monitor(
            app_runtime,
            name="edge-api",
            monitor_type="http",
            target="https://example.com",
        )
        db.add(monitor)
        db.flush()

        run = models.CheckRun(
            monitor_id=monitor.id,
            started_at=utc_now() - timedelta(minutes=2),
            duration_ms=120,
            attempts=1,
            success=True,
            status_code=200,
            error=None,
        )
        db.add(run)
        incident = models.Incident(
            monitor_id=monitor.id,
            state="open",
            opened_at=utc_now() - timedelta(minutes=15),
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
            models.IncidentEvent(
                incident_id=incident.id,
                event_type="opened",
                actor="system",
                note=None,
                created_at=incident.opened_at,
            )
        )
        db.commit()
        return SimpleNamespace(monitor_id=monitor.id, incident_id=incident.id)


def login(client: TestClient, *, email: str, password: str) -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()


def csrf_headers(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("opswatch_csrf", "")}


def test_login_logout_and_me_flow_records_audit(app_runtime, client: TestClient):
    user = create_user(app_runtime, email="admin@opswatch.dev", role="admin")

    login_response = client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "password123"},
    )
    assert login_response.status_code == 200
    payload = login_response.json()
    assert payload["email"] == user.email
    assert payload["role"] == "admin"
    assert payload["auth_method"] == "session"
    assert client.cookies.get("opswatch_session")
    assert client.cookies.get("opswatch_csrf")

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == user.email

    logout_response = client.post("/api/auth/logout", headers=csrf_headers(client))
    assert logout_response.status_code == 204

    expired_me = client.get("/api/auth/me")
    assert expired_me.status_code == 401

    with Session(app_runtime.engine) as db:
        actions = [row.action for row in db.scalars(select(app_runtime.models.AuditEvent)).all()]
    assert actions == ["auth.login", "auth.logout"]


def test_invalid_and_inactive_login_paths(app_runtime, client: TestClient):
    create_user(app_runtime, email="inactive@opswatch.dev", role="user", is_active=False)

    invalid_login = client.post(
        "/api/auth/login",
        json={"email": "inactive@opswatch.dev", "password": "wrong-password"},
    )
    assert invalid_login.status_code == 401
    assert invalid_login.json()["detail"] == "invalid email or password"

    inactive_login = client.post(
        "/api/auth/login",
        json={"email": "inactive@opswatch.dev", "password": "password123"},
    )
    assert inactive_login.status_code == 403
    assert inactive_login.json()["detail"] == "user is inactive"


def test_read_routes_require_auth(app_runtime, client: TestClient):
    seeded = seed_monitor_bundle(app_runtime)

    assert client.get("/health").status_code == 200
    assert client.get("/api/version").status_code == 200
    assert client.get("/api/monitors").status_code == 401
    assert client.get(f"/api/monitors/{seeded.monitor_id}").status_code == 401
    assert client.get("/api/summary").status_code == 401
    assert client.get("/api/status").status_code == 401
    assert client.get("/api/maintenance").status_code == 401


def test_user_role_is_read_only(app_runtime, client: TestClient):
    seeded = seed_monitor_bundle(app_runtime)
    login(
        client,
        email=create_user(app_runtime, email="user@opswatch.dev", role="user").email,
        password="password123",
    )

    assert client.get("/api/monitors").status_code == 200
    assert (
        client.post(
            f"/api/incidents/{seeded.incident_id}/ack", headers=csrf_headers(client)
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/incidents/{seeded.incident_id}/notes",
            headers=csrf_headers(client),
            json={"note": "Investigating"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/monitors/{seeded.monitor_id}/run", headers=csrf_headers(client)
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/maintenance",
            headers=csrf_headers(client),
            json={
                "monitor_id": seeded.monitor_id,
                "starts_at": utc_now().isoformat(),
                "ends_at": (utc_now() + timedelta(minutes=30)).isoformat(),
                "reason": "deploy",
            },
        ).status_code
        == 403
    )
    assert client.post("/api/monitors", headers=csrf_headers(client), json={}).status_code == 403
    assert client.get("/api/audit").status_code == 403
    assert client.get("/api/users").status_code == 403


def test_programmer_permissions_cover_incidents_runs_and_maintenance(
    app_runtime,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    seeded = seed_monitor_bundle(app_runtime)
    login(
        client,
        email=create_user(app_runtime, email="programmer@opswatch.dev", role="programmer").email,
        password="password123",
    )

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
            return SimpleNamespace(id="job-programmer-1")

    monkeypatch.setattr(app_runtime.main, "Redis", FakeRedis)
    monkeypatch.setattr(app_runtime.main, "Queue", FakeQueue)

    ack_response = client.post(
        f"/api/incidents/{seeded.incident_id}/ack",
        headers=csrf_headers(client),
    )
    assert ack_response.status_code == 200
    assert ack_response.json()["state"] == "acknowledged"

    note_response = client.post(
        f"/api/incidents/{seeded.incident_id}/notes",
        headers=csrf_headers(client),
        json={"note": "Working the issue"},
    )
    assert note_response.status_code == 200
    assert note_response.json()["timeline"][-1]["event_type"] == "note_added"

    run_response = client.post(
        f"/api/monitors/{seeded.monitor_id}/run",
        headers=csrf_headers(client),
    )
    assert run_response.status_code == 202
    assert enqueued == {
        "job_path": "opswatch_worker.jobs.run_check",
        "monitor_id": seeded.monitor_id,
    }

    create_window = client.post(
        "/api/maintenance",
        headers=csrf_headers(client),
        json={
            "monitor_id": seeded.monitor_id,
            "starts_at": utc_now().isoformat(),
            "ends_at": (utc_now() + timedelta(minutes=30)).isoformat(),
            "reason": "deploy",
        },
    )
    assert create_window.status_code == 201

    delete_window = client.delete(
        f"/api/maintenance/{create_window.json()['id']}",
        headers=csrf_headers(client),
    )
    assert delete_window.status_code == 204

    assert client.post("/api/monitors", headers=csrf_headers(client), json={}).status_code == 403
    assert client.get("/api/audit").status_code == 403
    assert client.get("/api/users").status_code == 403


def test_admin_can_manage_monitors_and_users(app_runtime, client: TestClient):
    seeded = seed_monitor_bundle(app_runtime)
    admin = create_user(app_runtime, email="admin@opswatch.dev", role="admin")
    login(client, email=admin.email, password="password123")

    create_monitor = client.post(
        "/api/monitors",
        headers=csrf_headers(client),
        json={
            "name": "billing-dns",
            "type": "dns",
            "service": "billing",
            "environment": "prod",
            "owner": "billing@opswatch.dev",
            "severity": "critical",
            "runbook_url": "https://runbooks.example.com/billing",
            "target": "billing.internal.example",
            "interval_seconds": 60,
            "timeout_seconds": 5,
            "incident_threshold": 2,
            "retries": 1,
            "http_keyword": None,
            "enabled": True,
        },
    )
    assert create_monitor.status_code == 201
    monitor_id = create_monitor.json()["id"]

    update_monitor = client.patch(
        f"/api/monitors/{monitor_id}",
        headers=csrf_headers(client),
        json={"severity": "high", "owner": "payments@opswatch.dev"},
    )
    assert update_monitor.status_code == 200

    delete_monitor = client.delete(f"/api/monitors/{monitor_id}", headers=csrf_headers(client))
    assert delete_monitor.status_code == 204

    create_user_response = client.post(
        "/api/users",
        headers=csrf_headers(client),
        json={
            "email": "viewer@opswatch.dev",
            "display_name": "Viewer",
            "password": "viewer-password",
            "role": "user",
            "is_active": True,
        },
    )
    assert create_user_response.status_code == 201
    user_id = create_user_response.json()["id"]

    update_user_response = client.patch(
        f"/api/users/{user_id}",
        headers=csrf_headers(client),
        json={"role": "programmer", "is_active": False},
    )
    assert update_user_response.status_code == 200
    assert update_user_response.json()["role"] == "programmer"
    assert update_user_response.json()["is_active"] is False

    audit_response = client.get("/api/audit")
    assert audit_response.status_code == 200
    audit_actions = [item["action"] for item in audit_response.json()]
    assert "user.create" in audit_actions
    assert "user.role.change" in audit_actions
    assert "user.deactivate" in audit_actions
    assert "auth.login" in audit_actions
    assert seeded.monitor_id > 0


def test_csrf_is_required_for_session_mutations_but_not_api_key_fallback(
    app_runtime,
    client: TestClient,
):
    create_user(app_runtime, email="admin@opswatch.dev", role="admin")
    login(client, email="admin@opswatch.dev", password="password123")

    session_without_csrf = client.post(
        "/api/monitors",
        json={
            "name": "edge-without-csrf",
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
            "http_keyword": None,
            "enabled": True,
        },
    )
    assert session_without_csrf.status_code == 403
    assert session_without_csrf.json()["detail"] == "csrf validation failed"

    api_key_fallback = client.post(
        "/api/monitors",
        headers={"X-API-Key": "test-api-key"},
        json={
            "name": "edge-api-key",
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
            "http_keyword": None,
            "enabled": True,
        },
    )
    assert api_key_fallback.status_code == 201


def test_admin_self_protection_and_last_active_admin_guard(app_runtime, client: TestClient):
    admin = create_user(app_runtime, email="admin@opswatch.dev", role="admin")
    login(client, email=admin.email, password="password123")

    self_role_change = client.patch(
        f"/api/users/{admin.id}",
        headers=csrf_headers(client),
        json={"role": "programmer"},
    )
    assert self_role_change.status_code == 403
    assert self_role_change.json()["detail"] == "admins cannot change their own role"

    self_deactivate = client.patch(
        f"/api/users/{admin.id}",
        headers=csrf_headers(client),
        json={"is_active": False},
    )
    assert self_deactivate.status_code == 403
    assert self_deactivate.json()["detail"] == "admins cannot deactivate themselves"

    api_key_role_change = client.patch(
        f"/api/users/{admin.id}",
        headers={"X-API-Key": "test-api-key"},
        json={"role": "programmer"},
    )
    assert api_key_role_change.status_code == 400
    assert api_key_role_change.json()["detail"] == "at least one active admin must remain"
