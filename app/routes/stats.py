from datetime import UTC, datetime, timedelta

from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import CheckRun, Monitor
from payloads import serialize_monitor_brief
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api", tags=["stats"])


def clamp_minutes(minutes: int) -> int:
    return max(5, min(minutes, 7 * 24 * 60))  # 5 min .. 7 days


def percentile(values: list[int], p: float) -> int | None:
    """
    Simple nearest-rank percentile.
    values: list of ints
    p: 0..100
    """
    if not values:
        return None
    values = sorted(values)
    # nearest-rank (1-indexed)
    k = int((p / 100.0) * (len(values) - 1))
    return values[k]


@router.get("/monitors/{monitor_id}/stats")
def monitor_stats(
    monitor_id: int,
    minutes: int = 60,
    db: Session = Depends(get_db),
):
    minutes = clamp_minutes(minutes)

    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    end = datetime.now(UTC)
    start = end - timedelta(minutes=minutes)

    # counts
    total = (
        db.scalar(
            select(func.count())
            .select_from(CheckRun)
            .where(
                CheckRun.monitor_id == monitor_id,
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
                CheckRun.monitor_id == monitor_id,
                CheckRun.started_at >= start,
                CheckRun.success.is_(True),
            )
        )
        or 0
    )

    failure_count = total - success_count
    uptime_pct = (success_count / total * 100.0) if total else None

    # latency percentiles (successful only)
    durations = db.scalars(
        select(CheckRun.duration_ms).where(
            CheckRun.monitor_id == monitor_id,
            CheckRun.started_at >= start,
            CheckRun.success.is_(True),
            CheckRun.duration_ms.is_not(None),
        )
    ).all()
    durations = [int(x) for x in durations if x is not None]

    p50 = percentile(durations, 50)
    p95 = percentile(durations, 95)

    return {
        "monitor": {
            **serialize_monitor_brief(m),
        },
        "window": {"minutes": minutes, "start": start.isoformat(), "end": end.isoformat()},
        "runs": {
            "total": total,
            "success": success_count,
            "failure": failure_count,
            "uptime_pct": uptime_pct,
        },
        "latency_ms": {
            "p50": p50,
            "p95": p95,
            "min": min(durations) if durations else None,
            "max": max(durations) if durations else None,
        },
    }
