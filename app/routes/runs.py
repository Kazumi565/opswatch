from deps import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import CheckRun, Monitor
from schemas import CheckRunOut
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api", tags=["runs"])


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


@router.get("/monitors/{monitor_id}/runs", response_model=list[CheckRunOut])
def list_monitor_runs(monitor_id: int, limit: int = 100, db: Session = Depends(get_db)):
    limit = clamp_limit(limit)

    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    stmt = (
        select(CheckRun)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.started_at.desc(), CheckRun.id.desc())
        .limit(limit)
    )
    runs = list(db.scalars(stmt).all())

    return runs


@router.get("/runs/{run_id}", response_model=CheckRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    r = db.get(CheckRun, run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Check run not found")

    return r
