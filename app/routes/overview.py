from datetime import UTC, datetime, timedelta

from deps import get_db
from domain import ACTIVE_INCIDENT_STATES
from fastapi import APIRouter, Depends
from models import CheckRun, Incident, Monitor
from payloads import serialize_incident_brief, serialize_monitor_brief
from schemas import OverviewOut
from security import require_authenticated_context
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from routes.maintenance_state import load_active_maintenance_state

router = APIRouter(
    prefix="/api/stats",
    tags=["stats"],
    dependencies=[Depends(require_authenticated_context)],
)


def clamp_minutes(minutes: int) -> int:
    return max(5, min(minutes, 7 * 24 * 60))


def percentile(values: list[int], p: float) -> int | None:
    if not values:
        return None
    values = sorted(values)
    k = int((p / 100.0) * (len(values) - 1))
    return values[k]


@router.get("/overview", response_model=OverviewOut)
def overview(minutes: int = 60, db: Session = Depends(get_db)):
    minutes = clamp_minutes(minutes)

    end = datetime.now(UTC)
    start = end - timedelta(minutes=minutes)

    monitors = list(db.scalars(select(Monitor).order_by(Monitor.id)).all())
    maintenance_state = load_active_maintenance_state(db, now=end)

    result = []
    for m in monitors:
        # counts in window
        total = (
            db.scalar(
                select(func.count())
                .select_from(CheckRun)
                .where(
                    CheckRun.monitor_id == m.id,
                    CheckRun.started_at >= start,
                )
            )
            or 0
        )

        success_count = (
            db.scalar(
                select(func.count())
                .select_from(CheckRun)
                .where(
                    CheckRun.monitor_id == m.id,
                    CheckRun.started_at >= start,
                    CheckRun.success.is_(True),
                )
            )
            or 0
        )

        uptime_pct = (success_count / total * 100.0) if total else None

        durations = db.scalars(
            select(CheckRun.duration_ms).where(
                CheckRun.monitor_id == m.id,
                CheckRun.started_at >= start,
                CheckRun.success.is_(True),
                CheckRun.duration_ms.is_not(None),
            )
        ).all()
        durations = [int(x) for x in durations if x is not None]
        lat_min = min(durations) if durations else None
        lat_max = max(durations) if durations else None

        p50 = percentile(durations, 50)
        p95 = percentile(durations, 95)

        # last run
        last_run = db.scalars(
            select(CheckRun)
            .where(CheckRun.monitor_id == m.id)
            .order_by(CheckRun.started_at.desc(), CheckRun.id.desc())
            .limit(1)
        ).first()

        last_run_payload = last_run

        # open incident?
        open_inc = db.scalars(
            select(Incident)
            .where(Incident.monitor_id == m.id, Incident.state.in_(ACTIVE_INCIDENT_STATES))
            .order_by(Incident.opened_at.desc(), Incident.id.desc())
            .limit(1)
        ).first()

        active_window = maintenance_state.window_for(m.id)
        maintenance = {
            "active": active_window is not None,
            "ends_at": active_window.ends_at if active_window else None,
            "reason": active_window.reason if active_window else None,
        }

        status = "unknown"
        if active_window:
            status = "maintenance"
        elif open_inc:
            status = "down"
        elif last_run:
            status = "up" if last_run.success else "down"

        result.append(
            {
                "monitor": {
                    **serialize_monitor_brief(m),
                },
                "uptime_pct": uptime_pct,
                "latency_ms": {
                    "p50": p50,
                    "p95": p95,
                    "min": lat_min,
                    "max": lat_max,
                },
                "maintenance": maintenance,
                "status": status,
                "last_run": last_run_payload,
                "open_incident": serialize_incident_brief(open_inc) if open_inc else None,
            }
        )

    return {
        "window": {"minutes": minutes, "start": start.isoformat(), "end": end.isoformat()},
        "monitors": result,
    }
