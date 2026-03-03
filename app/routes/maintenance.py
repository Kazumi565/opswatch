from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from deps import get_db
from models import MaintenanceWindow, Monitor
from schemas import MaintenanceCreate, MaintenanceOut

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("", response_model=MaintenanceOut, status_code=201)
def create_window(payload: MaintenanceCreate, db: Session = Depends(get_db)):
    if payload.monitor_id is not None:
        m = db.get(Monitor, payload.monitor_id)
        if not m:
            raise HTTPException(status_code=404, detail="Monitor not found")

    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    w = MaintenanceWindow(**payload.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


@router.get("", response_model=list[MaintenanceOut])
def list_windows(active: bool = False, db: Session = Depends(get_db)):
    stmt = select(MaintenanceWindow).order_by(MaintenanceWindow.starts_at.desc(), MaintenanceWindow.id.desc())
    rows = list(db.scalars(stmt).all())

    if not active:
        return rows

    now = datetime.now(timezone.utc)
    return [w for w in rows if w.starts_at <= now <= w.ends_at]


@router.delete("/{window_id}", status_code=204)
def delete_window(window_id: int, db: Session = Depends(get_db)):
    w = db.get(MaintenanceWindow, window_id)
    if not w:
        raise HTTPException(status_code=404, detail="Maintenance window not found")
    db.delete(w)
    db.commit()
    return None