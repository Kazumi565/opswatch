from models import Incident, IncidentEvent


def monitor_type_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def serialize_monitor_brief(monitor) -> dict:
    return {
        "id": monitor.id,
        "name": monitor.name,
        "type": monitor_type_value(monitor.type),
        "service": monitor.service,
        "environment": monitor.environment,
        "owner": monitor.owner,
        "severity": monitor.severity,
        "runbook_url": monitor.runbook_url,
        "target": monitor.target,
        "enabled": monitor.enabled,
        "interval_seconds": monitor.interval_seconds,
        "timeout_seconds": monitor.timeout_seconds,
    }


def serialize_check_run(run, monitor_name: str | None) -> dict:
    return {
        "id": run.id,
        "monitor_id": run.monitor_id,
        "monitor_name": monitor_name,
        "started_at": run.started_at,
        "duration_ms": run.duration_ms,
        "attempts": run.attempts,
        "success": run.success,
        "status_code": run.status_code,
        "error": run.error,
    }


def serialize_incident_event(event: IncidentEvent) -> dict:
    return {
        "id": event.id,
        "incident_id": event.incident_id,
        "event_type": event.event_type,
        "actor": event.actor,
        "note": event.note,
        "created_at": event.created_at,
    }


def serialize_incident(
    incident: Incident,
    monitor_name: str | None,
    *,
    timeline: list[IncidentEvent] | None = None,
) -> dict:
    payload = {
        "id": incident.id,
        "monitor_id": incident.monitor_id,
        "monitor_name": monitor_name,
        "state": incident.state,
        "opened_at": incident.opened_at,
        "resolved_at": incident.resolved_at,
        "failure_count": incident.failure_count,
        "last_error": incident.last_error,
        "service": incident.service,
        "environment": incident.environment,
        "owner": incident.owner,
        "severity": incident.severity,
        "runbook_url": incident.runbook_url,
    }
    if timeline is not None:
        payload["timeline"] = [serialize_incident_event(event) for event in timeline]
    return payload


def serialize_incident_brief(incident: Incident) -> dict:
    return {
        "id": incident.id,
        "state": incident.state,
        "opened_at": incident.opened_at.isoformat(),
        "failure_count": incident.failure_count,
        "last_error": incident.last_error,
    }
