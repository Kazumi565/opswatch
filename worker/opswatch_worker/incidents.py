from datetime import UTC, datetime

from opswatch_worker.models import CheckRun, Incident, IncidentEvent, MaintenanceWindow, Monitor
from sqlalchemy import or_, select

ACTIVE_INCIDENT_STATES = ("open", "acknowledged")


def now_utc():
    return datetime.now(UTC)


def add_incident_event(
    db,
    *,
    incident_id: int,
    event_type: str,
    actor: str = "system",
    note: str | None = None,
    created_at: datetime | None = None,
) -> None:
    db.add(
        IncidentEvent(
            incident_id=incident_id,
            event_type=event_type,
            actor=actor,
            note=note,
            created_at=created_at or now_utc(),
        )
    )


def evaluate_incident(db, monitor_id: int) -> None:
    m = db.scalar(select(Monitor).where(Monitor.id == monitor_id))
    if not m:
        return

    threshold = max(1, int(getattr(m, "incident_threshold", 3) or 3))
    latest = db.scalar(
        select(CheckRun)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.id.desc())
        .limit(1)
    )
    if not latest:
        return

    now = now_utc()
    maintenance_window = db.scalar(
        select(MaintenanceWindow)
        .where(
            MaintenanceWindow.starts_at <= now,
            MaintenanceWindow.ends_at >= now,
            or_(
                MaintenanceWindow.monitor_id == monitor_id,
                MaintenanceWindow.monitor_id.is_(None),
            ),
        )
        .order_by(MaintenanceWindow.id.desc())
        .limit(1)
    )
    active_incident = db.scalar(
        select(Incident)
        .where(
            Incident.monitor_id == monitor_id,
            Incident.state.in_(ACTIVE_INCIDENT_STATES),
        )
        .order_by(Incident.id.desc())
        .limit(1)
    )

    if latest.success:
        if active_incident:
            active_incident.state = "resolved"
            active_incident.resolved_at = now
            add_incident_event(
                db,
                incident_id=active_incident.id,
                event_type="resolved",
                created_at=now,
            )
        return

    recent = db.execute(
        select(CheckRun.success, CheckRun.error)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.id.desc())
        .limit(200)
    ).all()

    consecutive_failures = 0
    last_error = latest.error
    for success, error in recent:
        if success:
            break
        consecutive_failures += 1
        if last_error is None and error:
            last_error = error

    if active_incident:
        active_incident.failure_count = consecutive_failures
        active_incident.last_error = last_error
        return

    if maintenance_window or consecutive_failures < threshold:
        return

    incident = Incident(
        monitor_id=m.id,
        state="open",
        opened_at=now,
        resolved_at=None,
        failure_count=consecutive_failures,
        last_error=last_error,
        service=m.service,
        environment=m.environment,
        owner=m.owner,
        severity=m.severity,
        runbook_url=m.runbook_url,
    )
    db.add(incident)
    db.flush()
    add_incident_event(
        db,
        incident_id=incident.id,
        event_type="opened",
        created_at=now,
    )
