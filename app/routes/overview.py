from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from deps import get_db
from models import CheckRun, Incident, MaintenanceWindow, Monitor
from schemas import OverviewOut


router = APIRouter(prefix="/api/stats", tags=["stats"])


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

    end = datetime.now(timezone.utc)
    start = end - timedelta(minutes=minutes)

    monitors = list(db.scalars(select(Monitor).order_by(Monitor.id)).all())

    active_windows = db.scalars(
        select(MaintenanceWindow)
        .where(MaintenanceWindow.starts_at <= end, MaintenanceWindow.ends_at >= end)
        .order_by(MaintenanceWindow.id.desc())
    ).all()

    global_window = next((window for window in active_windows if window.monitor_id is None), None)
    monitor_windows: dict[int, MaintenanceWindow] = {}
    for window in active_windows:
        if window.monitor_id is None:
            continue
        if window.monitor_id not in monitor_windows:
            monitor_windows[window.monitor_id] = window

    result = []
    for m in monitors:
        # counts in window
        total = db.scalar(
            select(func.count()).select_from(CheckRun).where(
                CheckRun.monitor_id == m.id,
                CheckRun.started_at >= start,
            )
        ) or 0

        success_count = db.scalar(
            select(func.count()).select_from(CheckRun).where(
                CheckRun.monitor_id == m.id,
                CheckRun.started_at >= start,
                CheckRun.success.is_(True),
            )
        ) or 0

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
            select(CheckRun).where(CheckRun.monitor_id == m.id).order_by(CheckRun.started_at.desc(), CheckRun.id.desc()).limit(1)
        ).first()

        last_run_payload = last_run

        # open incident?
        open_inc = db.scalars(
            select(Incident)
            .where(Incident.monitor_id == m.id, Incident.status == "open")
            .order_by(Incident.opened_at.desc(), Incident.id.desc())
            .limit(1)
        ).first()

        active_window = monitor_windows.get(m.id) or global_window
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
                    "id": m.id,
                    "name": m.name,
                    "type": m.type.value if hasattr(m.type, "value") else str(m.type),
                    "target": m.target,
                    "enabled": m.enabled,
                    "interval_seconds": m.interval_seconds,
                    "timeout_seconds": m.timeout_seconds,
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
                "open_incident": (
                    {
                        "id": open_inc.id,
                        "opened_at": open_inc.opened_at.isoformat(),
                        "failure_count": open_inc.failure_count,
                        "last_error": open_inc.last_error,
                    }
                    if open_inc
                    else None
                ),
            }
        )

    return {
        "window": {"minutes": minutes, "start": start.isoformat(), "end": end.isoformat()},
        "monitors": result,
    }
