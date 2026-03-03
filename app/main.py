import time

from config import settings
from deps import get_db
from fastapi import Depends, FastAPI, HTTPException
from models import Monitor
from prometheus_client import Counter, Histogram
from redis import Redis
from routes.incidents import router as incidents_router
from routes.maintenance import router as maintenance_router
from routes.metrics import router as metrics_router
from routes.overview import router as overview_router
from routes.runs import router as runs_router
from routes.stats import router as stats_router
from routes.status import router as status_router
from routes.summary import router as summary_router
from rq import Queue
from schemas import MonitorCreate, MonitorOut, MonitorUpdate
from sqlalchemy import select
from sqlalchemy.orm import Session

HTTP_REQUESTS = Counter(
    "opswatch_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

HTTP_LATENCY = Histogram(
    "opswatch_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)

app = FastAPI(title="OpsWatch API", version="0.1.0")
app.include_router(incidents_router)
app.include_router(summary_router)
app.include_router(runs_router)
app.include_router(stats_router)
app.include_router(overview_router)
app.include_router(status_router)
app.include_router(maintenance_router)
app.include_router(metrics_router)


@app.middleware("http")
async def prometheus_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)

    # Keep labels low-cardinality (paths are OK here since your API paths are stable)
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    method = request.method
    status = str(response.status_code)

    HTTP_REQUESTS.labels(method=method, path=path, status=status).inc()
    HTTP_LATENCY.labels(method=method, path=path).observe(time.perf_counter() - start)

    return response


@app.get("/health")
def health():
    return {"status": "ok"}


# ---- Monitors ----


@app.post("/api/monitors", response_model=MonitorOut, status_code=201)
def create_monitor(payload: MonitorCreate, db: Session = Depends(get_db)):
    m = Monitor(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@app.get("/api/monitors", response_model=list[MonitorOut])
def list_monitors(db: Session = Depends(get_db)):
    return list(db.scalars(select(Monitor).order_by(Monitor.id)).all())


@app.get("/api/monitors/{monitor_id}", response_model=MonitorOut)
def get_monitor(monitor_id: int, db: Session = Depends(get_db)):
    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.patch("/api/monitors/{monitor_id}", response_model=MonitorOut)
def update_monitor(monitor_id: int, payload: MonitorUpdate, db: Session = Depends(get_db)):
    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(m, k, v)

    db.commit()
    db.refresh(m)
    return m


@app.delete("/api/monitors/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: int, db: Session = Depends(get_db)):
    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    db.delete(m)
    db.commit()
    return None


@app.post("/api/monitors/{monitor_id}/run", status_code=202)
def enqueue_check(monitor_id: int, db: Session = Depends(get_db)):
    m = db.get(Monitor, monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    redis_conn = Redis.from_url(settings.redis_url)
    q = Queue("checks", connection=redis_conn)
    job = q.enqueue("opswatch_worker.jobs.run_check", monitor_id)
    return {"job_id": job.id}
