from deps import get_db
from fastapi import APIRouter, Depends
from models import Incident, Monitor
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api", tags=["summary"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    total_monitors = db.scalar(select(func.count()).select_from(Monitor)) or 0
    enabled_monitors = (
        db.scalar(select(func.count()).select_from(Monitor).where(Monitor.enabled.is_(True))) or 0
    )

    open_incidents = (
        db.scalar(select(func.count()).select_from(Incident).where(Incident.status == "open")) or 0
    )

    # Optional: list the newest open incidents (lightweight, useful for UI)
    latest_open = db.execute(
        select(
            Incident.id,
            Incident.monitor_id,
            Incident.opened_at,
            Incident.failure_count,
            Incident.last_error,
        )
        .where(Incident.status == "open")
        .order_by(Incident.opened_at.desc(), Incident.id.desc())
        .limit(10)
    ).all()

    return {
        "monitors": {
            "total": total_monitors,
            "enabled": enabled_monitors,
        },
        "incidents": {
            "open": open_incidents,
            "latest_open": [
                {
                    "id": row.id,
                    "monitor_id": row.monitor_id,
                    "opened_at": row.opened_at,
                    "failure_count": row.failure_count,
                    "last_error": row.last_error,
                }
                for row in latest_open
            ],
        },
    }
