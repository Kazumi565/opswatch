from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import CheckRun, Monitor
from payloads import serialize_check_run
from schemas import CheckRunOut
from security import require_authenticated_context
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/api", tags=["runs"], dependencies=[Depends(require_authenticated_context)]
)


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


@router.get("/runs", response_model=list[CheckRunOut])
def list_runs(
    limit: int = 100,
    success: bool | None = None,
    monitor_id: int | None = None,
    db: Session = Depends(get_db),
):
    limit = clamp_limit(limit)

    stmt = select(CheckRun, Monitor.name.label("monitor_name")).join(
        Monitor, Monitor.id == CheckRun.monitor_id
    )

    if success is not None:
        stmt = stmt.where(CheckRun.success.is_(success))

    if monitor_id is not None:
        monitor = db.get(Monitor, monitor_id)
        if not monitor:
            raise HTTPException(status_code=404, detail="Monitor not found")
        stmt = stmt.where(CheckRun.monitor_id == monitor_id)

    rows = db.execute(
        stmt.order_by(CheckRun.started_at.desc(), CheckRun.id.desc()).limit(limit)
    ).all()
    return [serialize_check_run(run, monitor_name) for run, monitor_name in rows]


@router.get("/monitors/{monitor_id}/runs", response_model=list[CheckRunOut])
def list_monitor_runs(
    monitor_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = clamp_limit(limit)

    monitor = db.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    stmt = (
        select(CheckRun)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.started_at.desc(), CheckRun.id.desc())
        .limit(limit)
    )
    runs = list(db.scalars(stmt).all())

    return [serialize_check_run(run, monitor.name) for run in runs]


@router.get("/runs/{run_id}", response_model=CheckRunOut)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
):
    row = db.execute(
        select(CheckRun, Monitor.name.label("monitor_name"))
        .join(Monitor, Monitor.id == CheckRun.monitor_id)
        .where(CheckRun.id == run_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Check run not found")

    run, monitor_name = row
    return serialize_check_run(run, monitor_name)
