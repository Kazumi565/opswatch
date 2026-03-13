from models import AuditEvent
from sqlalchemy.orm import Session


def record_audit_event(
    db: Session,
    *,
    actor: str,
    action: str,
    resource_type: str,
    resource_id: int,
    summary_json: dict,
) -> AuditEvent:
    event = AuditEvent(
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        summary_json=summary_json,
    )
    db.add(event)
    return event
