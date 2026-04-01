from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

MonitorType = Literal["http", "tcp", "dns"]
MonitorSeverity = Literal["critical", "high", "medium", "low"]
IncidentState = Literal["open", "acknowledged", "resolved"]
IncidentEventType = Literal["opened", "acknowledged", "resolved", "note_added"]
UserRole = Literal["user", "programmer", "admin"]


class MonitorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: MonitorType
    service: str = Field(min_length=1, max_length=120)
    environment: str = Field(min_length=1, max_length=80)
    owner: str = Field(min_length=1, max_length=120)
    severity: MonitorSeverity = "medium"
    runbook_url: str | None = Field(default=None, max_length=500)
    target: str = Field(min_length=1, max_length=500)
    interval_seconds: int = Field(default=60, ge=5, le=3600)
    timeout_seconds: int = Field(default=5, ge=1, le=60)
    incident_threshold: int = Field(default=3, ge=1, le=20)
    retries: int = Field(default=0, ge=0, le=10)
    http_keyword: str | None = Field(default=None, max_length=500)
    enabled: bool = True


class MonitorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    type: MonitorType | None = None
    service: str | None = Field(default=None, min_length=1, max_length=120)
    environment: str | None = Field(default=None, min_length=1, max_length=80)
    owner: str | None = Field(default=None, min_length=1, max_length=120)
    severity: MonitorSeverity | None = None
    runbook_url: str | None = Field(default=None, max_length=500)
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
    service: str
    environment: str
    owner: str
    severity: MonitorSeverity
    runbook_url: str | None
    target: str
    interval_seconds: int
    timeout_seconds: int
    incident_threshold: int
    retries: int
    http_keyword: str | None
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentEventOut(BaseModel):
    id: int
    incident_id: int
    event_type: IncidentEventType
    actor: str
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentOut(BaseModel):
    id: int
    monitor_id: int
    monitor_name: str | None = None
    state: IncidentState
    opened_at: datetime
    resolved_at: datetime | None = None
    failure_count: int
    last_error: str | None = None
    service: str
    environment: str
    owner: str
    severity: MonitorSeverity
    runbook_url: str | None = None
    timeline: list[IncidentEventOut] | None = None

    model_config = {"from_attributes": True}


class IncidentNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class CheckRunOut(BaseModel):
    id: int
    monitor_id: int
    monitor_name: str | None = None
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
    service: str
    environment: str
    owner: str
    severity: MonitorSeverity
    runbook_url: str | None = None
    target: str
    enabled: bool
    interval_seconds: int
    timeout_seconds: int


class IncidentBriefOut(BaseModel):
    id: int
    state: IncidentState
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


class AuditEventOut(BaseModel):
    id: int
    created_at: datetime
    actor: str
    action: str
    resource_type: str
    resource_id: int
    summary_json: dict[str, Any]

    model_config = {"from_attributes": True}


class AuthLoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    role: UserRole = "user"
    is_active: bool = True


class UserUpdate(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=320)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=8, max_length=200)
    role: UserRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuthMeOut(BaseModel):
    id: int | None = None
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    auth_method: Literal["session", "api_key"]
    last_login_at: datetime | None = None
    session_expires_at: datetime | None = None
