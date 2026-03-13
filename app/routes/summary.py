from deps import get_db
from domain import ACTIVE_INCIDENT_STATES
from fastapi import APIRouter, Depends
from models import Incident, Monitor
from payloads import serialize_incident
from sqlalchemy import select
from sqlalchemy.orm import Session

from routes.maintenance_state import load_active_maintenance_state

router = APIRouter(prefix="/api", tags=["summary"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    monitors = list(db.scalars(select(Monitor).order_by(Monitor.id)).all())
    maintenance_state = load_active_maintenance_state(db)

    open_incidents_rows = db.execute(
        select(
            Incident,
            Monitor.name.label("monitor_name"),
        )
        .join(Monitor, Monitor.id == Incident.monitor_id)
        .where(Incident.state.in_(ACTIVE_INCIDENT_STATES))
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
    ).all()
    actionable_open_rows = [
        (incident, monitor_name)
        for incident, monitor_name in open_incidents_rows
        if not maintenance_state.active_for(incident.monitor_id)
    ]

    return {
        "monitors": {
            "total": len(monitors),
            "enabled": sum(1 for monitor in monitors if monitor.enabled),
        },
        "incidents": {
            "open_total": len(open_incidents_rows),
            "open_actionable": len(actionable_open_rows),
            "latest_total_open": [
                serialize_incident(incident, monitor_name)
                for incident, monitor_name in open_incidents_rows[:10]
            ],
            "latest_actionable_open": [
                serialize_incident(incident, monitor_name)
                for incident, monitor_name in actionable_open_rows[:10]
            ],
        },
    }
