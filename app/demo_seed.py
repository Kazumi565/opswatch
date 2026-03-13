from __future__ import annotations

from datetime import UTC, datetime, timedelta

from audit_log import record_audit_event
from db import SessionLocal
from models import CheckRun, Incident, IncidentEvent, MaintenanceWindow, Monitor, MonitorType
from sqlalchemy import select
from sqlalchemy.orm import Session


def utc_now() -> datetime:
    return datetime.now(UTC)


def add_run(
    *,
    db: Session,
    monitor: Monitor,
    started_at: datetime,
    duration_ms: int,
    success: bool,
    status_code: int | None = None,
    error: str | None = None,
    attempts: int = 1,
) -> None:
    db.add(
        CheckRun(
            monitor_id=monitor.id,
            started_at=started_at,
            duration_ms=duration_ms,
            attempts=attempts,
            success=success,
            status_code=status_code,
            error=error,
        )
    )


def add_incident_event(
    *,
    db: Session,
    incident: Incident,
    event_type: str,
    created_at: datetime,
    actor: str = "system",
    note: str | None = None,
) -> None:
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            event_type=event_type,
            actor=actor,
            note=note,
            created_at=created_at,
        )
    )


def seed_demo_data(db: Session) -> dict[str, int]:
    existing_monitor = db.scalar(select(Monitor.id).limit(1))
    if existing_monitor is not None:
        raise RuntimeError("demo seed only runs against an empty database")

    now = utc_now().replace(second=0, microsecond=0)
    start = now - timedelta(hours=6)

    monitors = [
        Monitor(
            name="edge-api-prod",
            type=MonitorType.http,
            service="edge-api",
            environment="prod",
            owner="platform@opswatch.dev",
            severity="high",
            runbook_url="https://runbooks.example.com/edge-api",
            target="https://example.com",
            interval_seconds=300,
            timeout_seconds=5,
            incident_threshold=3,
            retries=1,
            enabled=True,
        ),
        Monitor(
            name="billing-dns-prod",
            type=MonitorType.dns,
            service="billing",
            environment="prod",
            owner="payments@opswatch.dev",
            severity="critical",
            runbook_url="https://runbooks.example.com/billing-dns",
            target="billing.internal.example",
            interval_seconds=300,
            timeout_seconds=2,
            incident_threshold=2,
            retries=0,
            enabled=True,
        ),
        Monitor(
            name="checkout-worker-prod",
            type=MonitorType.tcp,
            service="checkout-worker",
            environment="prod",
            owner="checkout@opswatch.dev",
            severity="high",
            runbook_url="https://runbooks.example.com/checkout-worker",
            target="checkout.internal.example:443",
            interval_seconds=300,
            timeout_seconds=3,
            incident_threshold=2,
            retries=1,
            enabled=True,
        ),
        Monitor(
            name="catalog-web-prod",
            type=MonitorType.http,
            service="catalog-web",
            environment="prod",
            owner="catalog@opswatch.dev",
            severity="medium",
            runbook_url="https://runbooks.example.com/catalog-web",
            target="https://example.org",
            interval_seconds=300,
            timeout_seconds=5,
            incident_threshold=3,
            retries=0,
            enabled=True,
        ),
    ]

    db.add_all(monitors)
    db.flush()

    for monitor in monitors:
        record_audit_event(
            db,
            actor="seed",
            action="monitor.create",
            resource_type="monitor",
            resource_id=monitor.id,
            summary_json={
                "name": monitor.name,
                "service": monitor.service,
                "environment": monitor.environment,
                "severity": monitor.severity,
            },
        )

    for offset in range(12):
        started_at = start + timedelta(minutes=offset * 30)

        add_run(
            db=db,
            monitor=monitors[0],
            started_at=started_at,
            duration_ms=110 + (offset % 4) * 12,
            success=True,
            status_code=200,
        )

        add_run(
            db=db,
            monitor=monitors[1],
            started_at=started_at,
            duration_ms=90 + (offset % 3) * 8,
            success=offset < 9,
            error=None if offset < 9 else "dns resolve timeout after 2s",
        )

        add_run(
            db=db,
            monitor=monitors[2],
            started_at=started_at,
            duration_ms=70 + (offset % 5) * 10,
            success=offset < 8,
            error=None if offset < 8 else "tcp connect timeout after 3s",
            attempts=2 if offset >= 8 else 1,
        )

        add_run(
            db=db,
            monitor=monitors[3],
            started_at=started_at,
            duration_ms=140 + (offset % 4) * 9,
            success=True,
            status_code=200,
        )

    maintenance = MaintenanceWindow(
        monitor_id=monitors[3].id,
        starts_at=now - timedelta(minutes=45),
        ends_at=now + timedelta(minutes=30),
        reason="catalog canary deploy and synthetic suppression window",
    )
    db.add(maintenance)
    db.flush()
    record_audit_event(
        db,
        actor="seed",
        action="maintenance.create",
        resource_type="maintenance_window",
        resource_id=maintenance.id,
        summary_json={
            "monitor_id": maintenance.monitor_id,
            "starts_at": maintenance.starts_at.isoformat(),
            "ends_at": maintenance.ends_at.isoformat(),
            "reason": maintenance.reason,
        },
    )

    open_incident = Incident(
        monitor_id=monitors[1].id,
        state="open",
        opened_at=now - timedelta(minutes=60),
        resolved_at=None,
        failure_count=3,
        last_error="dns resolve timeout after 2s",
        service=monitors[1].service,
        environment=monitors[1].environment,
        owner=monitors[1].owner,
        severity=monitors[1].severity,
        runbook_url=monitors[1].runbook_url,
    )
    acknowledged_incident = Incident(
        monitor_id=monitors[2].id,
        state="acknowledged",
        opened_at=now - timedelta(minutes=90),
        resolved_at=None,
        failure_count=4,
        last_error="tcp connect timeout after 3s",
        service=monitors[2].service,
        environment=monitors[2].environment,
        owner=monitors[2].owner,
        severity=monitors[2].severity,
        runbook_url=monitors[2].runbook_url,
    )
    db.add_all([open_incident, acknowledged_incident])
    db.flush()

    add_incident_event(
        db=db,
        incident=open_incident,
        event_type="opened",
        created_at=open_incident.opened_at,
    )
    add_incident_event(
        db=db,
        incident=acknowledged_incident,
        event_type="opened",
        created_at=acknowledged_incident.opened_at,
    )
    add_incident_event(
        db=db,
        incident=acknowledged_incident,
        event_type="acknowledged",
        actor="seed",
        created_at=now - timedelta(minutes=55),
    )
    add_incident_event(
        db=db,
        incident=acknowledged_incident,
        event_type="note_added",
        actor="seed",
        created_at=now - timedelta(minutes=50),
        note="Investigating checkout network saturation while rollout continues.",
    )

    record_audit_event(
        db,
        actor="seed",
        action="incident.acknowledge",
        resource_type="incident",
        resource_id=acknowledged_incident.id,
        summary_json={"monitor_id": acknowledged_incident.monitor_id, "state": "acknowledged"},
    )
    record_audit_event(
        db,
        actor="seed",
        action="incident.note",
        resource_type="incident",
        resource_id=acknowledged_incident.id,
        summary_json={
            "monitor_id": acknowledged_incident.monitor_id,
            "note_preview": "Investigating checkout network saturation while rollout continues.",
        },
    )

    db.commit()

    return {
        "monitors": len(monitors),
        "open_incidents": 1,
        "acknowledged_incidents": 1,
        "maintenance_windows": 1,
    }


def main() -> None:
    with SessionLocal() as db:
        summary = seed_demo_data(db)

    print("OpsWatch demo data seeded.")
    print(
        "monitors={monitors} open_incidents={open_incidents} "
        "acknowledged_incidents={acknowledged_incidents} maintenance_windows={maintenance_windows}".format(
            **summary
        )
    )


if __name__ == "__main__":
    main()
