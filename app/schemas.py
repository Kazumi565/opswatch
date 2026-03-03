from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

MonitorType = Literal["http", "tcp", "dns"]

class MonitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: MonitorType
    target: str = Field(min_length=1, max_length=500)
    interval_seconds: int = Field(default=60, ge=5, le=3600)
    timeout_seconds: int = Field(default=5, ge=1, le=60)
    incident_threshold: int = Field(default=3, ge=1, le=20)

    retries: int = Field(default=0, ge=0, le=10)
    http_keyword: Optional[str] = Field(default=None, max_length=500)

    enabled: bool = True

class MonitorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    target: Optional[str] = Field(default=None, min_length=1, max_length=500)
    interval_seconds: Optional[int] = Field(default=None, ge=5, le=3600)
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=60)
    incident_threshold: Optional[int] = Field(default=None, ge=1, le=20)

    retries: Optional[int] = Field(default=None, ge=0, le=10)
    http_keyword: Optional[str] = Field(default=None, max_length=500)

    enabled: Optional[bool] = None

class MonitorOut(BaseModel):
    id: int
    name: str
    type: str
    target: str
    interval_seconds: int
    timeout_seconds: int
    incident_threshold: int
    retries: int
    http_keyword: Optional[str]
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentOut(BaseModel):
    id: int
    monitor_id: int
    status: str
    opened_at: datetime
    resolved_at: Optional[datetime] = None
    failure_count: int
    last_error: Optional[str] = None

    model_config = {"from_attributes": True}
class CheckRunOut(BaseModel):
    id: int
    monitor_id: int
    started_at: datetime
    duration_ms: int
    attempts: int
    success: bool
    status_code: Optional[int] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class WindowOut(BaseModel):
    minutes: int
    start: str
    end: str


class LatencyOut(BaseModel):
    p50: Optional[int] = None
    p95: Optional[int] = None
    min: Optional[int] = None
    max: Optional[int] = None


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
    last_error: Optional[str] = None


class MaintenanceActiveOut(BaseModel):
    active: bool
    ends_at: Optional[datetime] = None
    reason: Optional[str] = None


class MonitorStatusOut(BaseModel):
    monitor: MonitorBriefOut
    status: Literal["up", "down", "unknown", "maintenance"]
    uptime_pct: Optional[float] = None
    latency_ms: LatencyOut
    maintenance: MaintenanceActiveOut
    last_run: Optional[CheckRunOut] = None
    open_incident: Optional[IncidentBriefOut] = None


class OverviewOut(BaseModel):
    window: WindowOut
    monitors: List[MonitorStatusOut]


class StatusOut(BaseModel):
    generated_at: str
    overall: Literal["up", "degraded", "down"]
    window: WindowOut
    monitors: List[MonitorStatusOut]
    open_incidents: List[IncidentOut]

class MaintenanceCreate(BaseModel):
    monitor_id: Optional[int] = None  # null means global
    starts_at: datetime
    ends_at: datetime
    reason: Optional[str] = None

class MaintenanceOut(BaseModel):
    id: int
    monitor_id: Optional[int] = None
    starts_at: datetime
    ends_at: datetime
    reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
