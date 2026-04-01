from datetime import UTC, datetime

from audit_log import record_audit_event
from deps import get_db
from domain import ACTIVE_INCIDENT_STATES
from fastapi import APIRouter, Depends, HTTPException
from models import Incident, IncidentEvent, Monitor
from payloads import serialize_incident
from schemas import IncidentNoteCreate, IncidentOut
from security import AuthContext, require_authenticated_context, require_programmer_context
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

router = APIRouter(
    prefix="/api/incidents",
    tags=["incidents"],
    dependencies=[Depends(require_authenticated_context)],
)


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


def utc_now() -> datetime:
    return datetime.now(UTC)


def get_incident_or_404(db: Session, incident_id: int) -> Incident:
    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id).options(selectinload(Incident.events))
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


def incident_response(db: Session, incident: Incident, *, include_timeline: bool) -> dict:
    monitor_name = db.scalar(select(Monitor.name).where(Monitor.id == incident.monitor_id))
    timeline = list(incident.events) if include_timeline else None
    return serialize_incident(incident, monitor_name, timeline=timeline)


@router.get("", response_model=list[IncidentOut])
def list_incidents(limit: int = 100, db: Session = Depends(get_db)):
    limit = clamp_limit(limit)
    rows = db.execute(
        select(Incident, Monitor.name.label("monitor_name"))
        .join(Monitor, Monitor.id == Incident.monitor_id)
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(limit)
    ).all()
    return [serialize_incident(incident, monitor_name) for incident, monitor_name in rows]


@router.get("/open", response_model=list[IncidentOut])
def list_open_incidents(limit: int = 100, db: Session = Depends(get_db)):
    limit = clamp_limit(limit)
    rows = db.execute(
        select(Incident, Monitor.name.label("monitor_name"))
        .join(Monitor, Monitor.id == Incident.monitor_id)
        .where(Incident.state.in_(ACTIVE_INCIDENT_STATES))
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(limit)
    ).all()
    return [serialize_incident(incident, monitor_name) for incident, monitor_name in rows]


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = get_incident_or_404(db, incident_id)
    return incident_response(db, incident, include_timeline=True)


@router.post("/{incident_id}/ack", response_model=IncidentOut)
def acknowledge_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_programmer_context),
):
    incident = get_incident_or_404(db, incident_id)

    if incident.state == "resolved":
        raise HTTPException(status_code=400, detail="Resolved incidents cannot be acknowledged")

    if incident.state == "open":
        incident.state = "acknowledged"
        db.add(
            IncidentEvent(
                incident_id=incident.id,
                event_type="acknowledged",
                actor=auth.actor,
                note=None,
                created_at=utc_now(),
            )
        )
        record_audit_event(
            db,
            actor=auth.actor,
            action="incident.acknowledge",
            resource_type="incident",
            resource_id=incident.id,
            summary_json={"state": incident.state, "monitor_id": incident.monitor_id},
        )
        db.commit()
        db.refresh(incident)

    return incident_response(db, incident, include_timeline=True)


@router.post("/{incident_id}/notes", response_model=IncidentOut)
def add_incident_note(
    incident_id: int,
    payload: IncidentNoteCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_programmer_context),
):
    incident = get_incident_or_404(db, incident_id)

    if incident.state == "resolved":
        raise HTTPException(status_code=400, detail="Resolved incidents cannot accept notes")

    note_text = payload.note.strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="note must not be empty")

    db.add(
        IncidentEvent(
            incident_id=incident.id,
            event_type="note_added",
            actor=auth.actor,
            note=note_text,
            created_at=utc_now(),
        )
    )
    record_audit_event(
        db,
        actor=auth.actor,
        action="incident.note",
        resource_type="incident",
        resource_id=incident.id,
        summary_json={"monitor_id": incident.monitor_id, "note_preview": note_text[:120]},
    )
    db.commit()
    db.refresh(incident)
    return incident_response(db, incident, include_timeline=True)
