import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from worker.db import SessionLocal
from worker.models import Monitor, CheckRun, MonitorType

def run_check(monitor_id: int) -> None:
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    status_code = None
    success = False
    error = None

    with SessionLocal() as db:
        m = db.scalar(select(Monitor).where(Monitor.id == monitor_id))
        if not m:
            return

        try:
            if m.type == MonitorType.http:
                with httpx.Client(timeout=m.timeout_seconds, follow_redirects=True) as client:
                    r = client.get(m.target)
                    status_code = r.status_code
                    success = 200 <= r.status_code < 400
            else:
                error = f"check type not implemented: {m.type}"
        except Exception as e:
            error = str(e)

        dur_ms = int((time.perf_counter() - t0) * 1000)

        db.add(CheckRun(
            monitor_id=m.id,
            started_at=started,
            duration_ms=dur_ms,
            success=success,
            status_code=status_code,
            error=error,
        ))
        db.commit()
