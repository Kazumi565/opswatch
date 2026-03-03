from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MonitorType = Literal["http", "tcp", "dns"]


class MonitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: MonitorType
    target: str = Field(min_length=1, max_length=500)
    interval_seconds: int = Field(default=60, ge=5, le=3600)
    timeout_seconds: int = Field(default=5, ge=1, le=60)
    incident_threshold: int = Field(default=3, ge=1, le=20)

    retries: int = Field(default=0, ge=0, le=10)
    http_keyword: str | None = Field(default=None, max_length=500)

    enabled: bool = True


class MonitorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target: str | None = Field(default=None, min_length=1, max_length=500)
    interval_seconds: int | None = Field(default=None, ge=5, le=3600)
    timeout_seconds: int | None = Field(default=None, ge=1, le=60)
    incident_threshold: int | None = Field(default=None, ge=1, le=20)

    retries: int | None = Field(default=None, ge=0, le=10)
    http_keyword: str | None = Field(default=None, max_length=500)

    enabled: bool | None = None


class MonitorOut(BaseModel):
    id: int
    name: str
    type: str
    target: str
    interval_seconds: int
    timeout_seconds: int
    incident_threshold: int
    retries: int
    http_keyword: str | None
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentOut(BaseModel):
    id: int
    monitor_id: int
    status: str
    opened_at: datetime
    resolved_at: datetime | None = None
    failure_count: int
    last_error: str | None = None

    model_config = {"from_attributes": True}


class CheckRunOut(BaseModel):
    id: int
    monitor_id: int
    started_at: datetime
    duration_ms: int
    attempts: int
    success: bool
    status_code: int | None = None
    error: str | None = None

    model_config = {"from_attributes": True}


class WindowOut(BaseModel):
    minutes: int
    start: str
    end: str


class LatencyOut(BaseModel):
    p50: int | None = None
    p95: int | None = None
    min: int | None = None
    max: int | None = None


class MonitorBriefOut(BaseModel):
    id: int
    name: str
    type: str
    target: str
    enabled: bool
    interval_seconds: int
    timeout_seconds: int


class IncidentBriefOut(BaseModel):
    id: int
    opened_at: str
    failure_count: int
    last_error: str | None = None


class MaintenanceActiveOut(BaseModel):
    active: bool
    ends_at: datetime | None = None
    reason: str | None = None


class MonitorStatusOut(BaseModel):
    monitor: MonitorBriefOut
    status: Literal["up", "down", "unknown", "maintenance"]
    uptime_pct: float | None = None
    latency_ms: LatencyOut
    maintenance: MaintenanceActiveOut
    last_run: CheckRunOut | None = None
    open_incident: IncidentBriefOut | None = None


class OverviewOut(BaseModel):
    window: WindowOut
    monitors: list[MonitorStatusOut]


class StatusOut(BaseModel):
    generated_at: str
    overall: Literal["up", "degraded", "down"]
    window: WindowOut
    monitors: list[MonitorStatusOut]
    open_incidents: list[IncidentOut]


class MaintenanceCreate(BaseModel):
    monitor_id: int | None = None  # null means global
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


class MaintenanceOut(BaseModel):
    id: int
    monitor_id: int | None = None
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
