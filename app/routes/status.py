from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from deps import get_db
from models import Incident
from routes.overview import overview  # reuse existing logic
from schemas import StatusOut

router = APIRouter(prefix="/api", tags=["status"])


@router.get("/status", response_model=StatusOut)
def status(minutes: int = 60, db: Session = Depends(get_db)):
    ov = overview(minutes=minutes, db=db)

    # Only consider enabled monitors for overall health
    enabled_items = [m for m in ov["monitors"] if m["monitor"].get("enabled", True)]

    # Which enabled monitors are currently in maintenance?
    maintenance_ids = {
        m["monitor"]["id"]
        for m in enabled_items
        if m.get("maintenance", {}).get("active") is True or m.get("status") == "maintenance"
    }

    # "down" should ignore monitors in maintenance
    any_down_nonmaint = any(
        (m.get("status") == "down") and (m["monitor"]["id"] not in maintenance_ids)
        for m in enabled_items
    )

    # Fetch open incidents, but ignore ones for monitors in maintenance
    open_incidents_all = db.scalars(
        select(Incident)
        .where(Incident.status == "open")
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(50)
    ).all()

    open_incidents = [i for i in open_incidents_all if i.monitor_id not in maintenance_ids]
    any_open_nonmaint = len(open_incidents) > 0

    any_maint = len(maintenance_ids) > 0

    # Overall policy:
    # - down: any non-maintenance monitor down OR any open incident for non-maintenance monitor
    # - degraded: no down, but at least one enabled monitor is in maintenance
    # - up: otherwise
    if any_down_nonmaint or any_open_nonmaint:
        overall = "down"
    elif any_maint:
        overall = "degraded"
    else:
        overall = "up"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overall": overall,
        "window": ov["window"],
        "monitors": ov["monitors"],
        "open_incidents": [
            {
                "id": i.id,
                "monitor_id": i.monitor_id,
                "status": i.status,
                "opened_at": i.opened_at.isoformat(),
                "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
                "failure_count": i.failure_count,
                "last_error": i.last_error,
            }
            for i in open_incidents
        ],
    }