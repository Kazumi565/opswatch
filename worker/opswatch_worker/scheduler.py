import os
import time
from datetime import datetime, timezone, timedelta

from redis import Redis
from rq import Queue
from sqlalchemy import func, select

from opswatch_worker.db import SessionLocal
from opswatch_worker.models import Monitor, CheckRun

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = os.getenv("RQ_QUEUE", "checks")
POLL_SECONDS = int(os.getenv("SCHEDULER_POLL_SECONDS", "5"))

def now_utc():
    return datetime.now(timezone.utc)

def main():
    r = Redis.from_url(REDIS_URL)
    q = Queue(QUEUE_NAME, connection=r)
    print(f"[scheduler] started queue={QUEUE_NAME} poll={POLL_SECONDS}s")

    while True:
        now = now_utc()

        with SessionLocal() as db:
            stmt = (
                select(Monitor, func.max(CheckRun.started_at).label("last_started"))
                .outerjoin(CheckRun, CheckRun.monitor_id == Monitor.id)
                .where(Monitor.enabled.is_(True))
                .group_by(Monitor.id)
            )
            rows = db.execute(stmt).all()

        for m, last_started in rows:
            interval = int(m.interval_seconds)
            if interval <= 0:
                continue

            baseline = last_started or m.created_at or now
            due_at = baseline + timedelta(seconds=interval)

            if now >= due_at:
                window = int(now.timestamp()) // interval
                job_id = f"check:{m.id}:{window}"

                if q.fetch_job(job_id) is None:
                    q.enqueue("opswatch_worker.jobs.run_check", m.id, job_id=job_id)
                    print(f"[scheduler] enqueued monitor={m.id} job_id={job_id}")

        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
