from datetime import UTC, datetime

from audit_log import record_audit_event
from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import MaintenanceWindow, Monitor
from schemas import MaintenanceCreate, MaintenanceOut
from security import require_api_key
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("", response_model=MaintenanceOut, status_code=201)
def create_window(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    actor: str = Depends(require_api_key),
):
    if payload.monitor_id is not None:
        m = db.get(Monitor, payload.monitor_id)
        if not m:
            raise HTTPException(status_code=404, detail="Monitor not found")

    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    w = MaintenanceWindow(**payload.model_dump())
    db.add(w)
    db.flush()
    record_audit_event(
        db,
        actor=actor,
        action="maintenance.create",
        resource_type="maintenance_window",
        resource_id=w.id,
        summary_json={
            "monitor_id": w.monitor_id,
            "starts_at": w.starts_at.isoformat(),
            "ends_at": w.ends_at.isoformat(),
            "reason": w.reason,
        },
    )
    db.commit()
    db.refresh(w)
    return w


@router.get("", response_model=list[MaintenanceOut])
def list_windows(active: bool = False, db: Session = Depends(get_db)):
    stmt = select(MaintenanceWindow).order_by(
        MaintenanceWindow.starts_at.desc(), MaintenanceWindow.id.desc()
    )
    rows = list(db.scalars(stmt).all())

    if not active:
        return rows

    now = datetime.now(UTC)
    return [w for w in rows if w.starts_at <= now <= w.ends_at]


@router.delete("/{window_id}", status_code=204)
def delete_window(
    window_id: int,
    db: Session = Depends(get_db),
    actor: str = Depends(require_api_key),
):
    w = db.get(MaintenanceWindow, window_id)
    if not w:
        raise HTTPException(status_code=404, detail="Maintenance window not found")
    summary = {
        "monitor_id": w.monitor_id,
        "starts_at": w.starts_at.isoformat(),
        "ends_at": w.ends_at.isoformat(),
        "reason": w.reason,
    }
    db.delete(w)
    record_audit_event(
        db,
        actor=actor,
        action="maintenance.delete",
        resource_type="maintenance_window",
        resource_id=window_id,
        summary_json=summary,
    )
    db.commit()
    return None
