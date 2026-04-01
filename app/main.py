import time
from functools import lru_cache
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from audit_log import record_audit_event
from config import settings
from db import SessionLocal
from deps import get_db
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from models import Monitor
from payloads import monitor_type_value
from prometheus_client import Counter, Histogram
from redis import Redis
from routes.audit import router as audit_router
from routes.auth import router as auth_router
from routes.incidents import router as incidents_router
from routes.maintenance import router as maintenance_router
from routes.metrics import router as metrics_router
from routes.overview import router as overview_router
from routes.runs import router as runs_router
from routes.stats import router as stats_router
from routes.status import router as status_router
from routes.summary import router as summary_router
from routes.users import router as users_router
from rq import Queue
from schemas import MonitorCreate, MonitorOut, MonitorUpdate
from security import (
    AuthContext,
    require_admin_context,
    require_authenticated_context,
    require_programmer_context,
)
from sqlalchemy import select, text
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

app = FastAPI(title="OpsWatch API", version=settings.app_version)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(audit_router)
app.include_router(incidents_router)
app.include_router(summary_router)
app.include_router(runs_router)
app.include_router(stats_router)
app.include_router(overview_router)
app.include_router(status_router)
app.include_router(maintenance_router)
app.include_router(metrics_router)


@lru_cache
def alembic_head_revision() -> str:
    alembic_ini = Path(__file__).with_name("alembic.ini")
    config = AlembicConfig(str(alembic_ini))
    config.set_main_option("script_location", str(alembic_ini.with_name("migrations")))
    return ScriptDirectory.from_config(config).get_current_head()


def check_database_ready(db: Session) -> None:
    db.execute(text("SELECT 1"))
    current_revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    if current_revision != alembic_head_revision():
        raise RuntimeError(
            f"database revision {current_revision!r} is not at head {alembic_head_revision()!r}"
        )


def check_redis_ready() -> None:
    redis_conn = Redis.from_url(settings.redis_url)
    redis_conn.ping()


def _check_database() -> tuple[bool, str]:
    try:
        with SessionLocal() as db:
            check_database_ready(db)
        return True, f"ok (head {alembic_head_revision()})"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _check_redis() -> tuple[bool, str]:
    try:
        check_redis_ready()
        return True, "ok"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


@app.middleware("http")
async def prometheus_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)

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


@app.get("/health/live")
def health_live():
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    db_ok, db_detail = _check_database()
    redis_ok, redis_detail = _check_redis()

    ready = db_ok and redis_ok
    status = "ready" if ready else "degraded" if db_ok else "not_ready"
    payload = {
        "status": status,
        "ready": ready,
        "dependencies": {
            "database": {
                "required": True,
                "ok": db_ok,
                "detail": db_detail,
            },
            "redis": {
                "required": True,
                "ok": redis_ok,
                "detail": redis_detail,
            },
        },
    }

    if ready:
        return payload

    return JSONResponse(status_code=503, content=payload)


@app.get("/ready")
def ready(db: Session = Depends(get_db)):
    try:
        check_database_ready(db)
    except Exception as exc:  # pragma: no cover - surfaced via HTTP contract tests
        raise HTTPException(status_code=503, detail=f"database not ready: {exc}") from exc

    try:
        check_redis_ready()
    except Exception as exc:  # pragma: no cover - surfaced via HTTP contract tests
        raise HTTPException(status_code=503, detail=f"redis not ready: {exc}") from exc

    return {
        "status": "ok",
        "database": "ok",
        "redis": "ok",
        "migration_revision": alembic_head_revision(),
    }


@app.get("/api/version")
def api_version():
    return {
        "version": settings.app_version,
        "commit": settings.app_commit,
        "built_at": settings.app_built_at,
    }


@app.post("/api/monitors", response_model=MonitorOut, status_code=201)
def create_monitor(
    payload: MonitorCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_admin_context),
):
    monitor = Monitor(**payload.model_dump())
    db.add(monitor)
    db.flush()
    record_audit_event(
        db,
        actor=auth.actor,
        action="monitor.create",
        resource_type="monitor",
        resource_id=monitor.id,
        summary_json={
            "name": monitor.name,
            "type": monitor_type_value(monitor.type),
            "service": monitor.service,
            "environment": monitor.environment,
            "severity": monitor.severity,
            "enabled": monitor.enabled,
        },
    )
    db.commit()
    db.refresh(monitor)
    return monitor


@app.get("/api/monitors", response_model=list[MonitorOut])
def list_monitors(
    db: Session = Depends(get_db),
    _auth: AuthContext = Depends(require_authenticated_context),
):
    return list(db.scalars(select(Monitor).order_by(Monitor.id)).all())


@app.get("/api/monitors/{monitor_id}", response_model=MonitorOut)
def get_monitor(
    monitor_id: int,
    db: Session = Depends(get_db),
    _auth: AuthContext = Depends(require_authenticated_context),
):
    monitor = db.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return monitor


@app.patch("/api/monitors/{monitor_id}", response_model=MonitorOut)
def update_monitor(
    monitor_id: int,
    payload: MonitorUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_admin_context),
):
    monitor = db.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    data = payload.model_dump(exclude_unset=True)
    before = {
        key: monitor_type_value(getattr(monitor, key)) if key == "type" else getattr(monitor, key)
        for key in data
    }
    for key, value in data.items():
        setattr(monitor, key, value)

    record_audit_event(
        db,
        actor=auth.actor,
        action="monitor.update",
        resource_type="monitor",
        resource_id=monitor.id,
        summary_json={
            "before": before,
            "after": {
                key: monitor_type_value(getattr(monitor, key))
                if key == "type"
                else getattr(monitor, key)
                for key in data
            },
        },
    )
    db.commit()
    db.refresh(monitor)
    return monitor


@app.delete("/api/monitors/{monitor_id}", status_code=204)
def delete_monitor(
    monitor_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_admin_context),
):
    monitor = db.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    summary = {
        "name": monitor.name,
        "type": monitor_type_value(monitor.type),
        "service": monitor.service,
        "environment": monitor.environment,
        "severity": monitor.severity,
    }
    db.delete(monitor)
    record_audit_event(
        db,
        actor=auth.actor,
        action="monitor.delete",
        resource_type="monitor",
        resource_id=monitor_id,
        summary_json=summary,
    )
    db.commit()
    return None


@app.post("/api/monitors/{monitor_id}/run", status_code=202)
def enqueue_check(
    monitor_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_programmer_context),
):
    monitor = db.get(Monitor, monitor_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue("checks", connection=redis_conn)
    job = queue.enqueue("opswatch_worker.jobs.run_check", monitor_id)
    record_audit_event(
        db,
        actor=auth.actor,
        action="monitor.run.enqueue",
        resource_type="monitor",
        resource_id=monitor.id,
        summary_json={
            "job_id": job.id,
            "name": monitor.name,
            "service": monitor.service,
            "environment": monitor.environment,
        },
    )
    db.commit()
    return {"job_id": job.id}
