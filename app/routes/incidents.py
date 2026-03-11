from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import Incident, Monitor
from schemas import IncidentOut
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


def serialize_incident(incident: Incident, monitor_name: str | None) -> dict:
    return {
        "id": incident.id,
        "monitor_id": incident.monitor_id,
        "monitor_name": monitor_name,
        "status": incident.status,
        "opened_at": incident.opened_at,
        "resolved_at": incident.resolved_at,
        "failure_count": incident.failure_count,
        "last_error": incident.last_error,
    }


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
        .where(Incident.status == "open")
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(limit)
    ).all()
    return [serialize_incident(incident, monitor_name) for incident, monitor_name in rows]


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        select(Incident, Monitor.name.label("monitor_name"))
        .join(Monitor, Monitor.id == Incident.monitor_id)
        .where(Incident.id == incident_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident, monitor_name = row
    return serialize_incident(incident, monitor_name)