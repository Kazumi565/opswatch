from datetime import UTC, datetime

from deps import get_db
from domain import ACTIVE_INCIDENT_STATES
from fastapi import APIRouter, Depends
from models import Incident, Monitor
from payloads import serialize_incident
from schemas import StatusOut
from sqlalchemy import select
from sqlalchemy.orm import Session

from routes.maintenance_state import load_active_maintenance_state
from routes.overview import overview  # reuse existing logic

router = APIRouter(prefix="/api", tags=["status"])


@router.get("/status", response_model=StatusOut)
def status(minutes: int = 60, db: Session = Depends(get_db)):
    ov = overview(minutes=minutes, db=db)
    maintenance_state = load_active_maintenance_state(db)

    # Only consider enabled monitors for overall health
    enabled_items = [m for m in ov["monitors"] if m["monitor"].get("enabled", True)]

    # "down" should ignore monitors in maintenance
    any_down_nonmaint = any(
        (m.get("status") == "down") and not maintenance_state.active_for(m["monitor"]["id"])
        for m in enabled_items
    )

    # Fetch open incidents, but ignore ones for monitors in maintenance
    open_incidents_rows = db.execute(
        select(Incident, Monitor.name.label("monitor_name"))
        .join(Monitor, Monitor.id == Incident.monitor_id)
        .where(Incident.state.in_(ACTIVE_INCIDENT_STATES))
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(50)
    ).all()

    open_incidents_filtered = [
        (incident, monitor_name)
        for incident, monitor_name in open_incidents_rows
        if not maintenance_state.active_for(incident.monitor_id)
    ]

    any_open_nonmaint = len(open_incidents_filtered) > 0
    any_maint = any(maintenance_state.active_for(item["monitor"]["id"]) for item in enabled_items)

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
        "generated_at": datetime.now(UTC).isoformat(),
        "overall": overall,
        "window": ov["window"],
        "monitors": ov["monitors"],
        "open_incidents": [
            serialize_incident(incident, monitor_name)
            for incident, monitor_name in open_incidents_filtered
        ],
    }
