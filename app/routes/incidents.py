from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import Incident
from schemas import IncidentOut
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


@router.get("", response_model=list[IncidentOut])
def list_incidents(limit: int = 100, db: Session = Depends(get_db)):
    limit = clamp_limit(limit)
    stmt = select(Incident).order_by(Incident.opened_at.desc(), Incident.id.desc()).limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/open", response_model=list[IncidentOut])
def list_open_incidents(limit: int = 100, db: Session = Depends(get_db)):
    limit = clamp_limit(limit)
    stmt = (
        select(Incident)
        .where(Incident.status == "open")
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc
