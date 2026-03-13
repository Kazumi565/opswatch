import enum
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class MonitorType(enum.StrEnum):
    http = "http"
    tcp = "tcp"
    dns = "dns"


class Monitor(Base):
    __tablename__ = "monitors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[MonitorType] = mapped_column(Enum(MonitorType), nullable=False)
    service: Mapped[str] = mapped_column(String(120), nullable=False, default="unassigned")
    environment: Mapped[str] = mapped_column(String(80), nullable=False, default="dev")
    owner: Mapped[str] = mapped_column(String(120), nullable=False, default="unknown")
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    runbook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    target: Mapped[str] = mapped_column(String(500), nullable=False)
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    incident_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    retries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    http_keyword: Mapped[str | None] = mapped_column(Text, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class CheckRun(Base):
    __tablename__ = "check_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_id: Mapped[int] = mapped_column(ForeignKey("monitors.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_id: Mapped[int] = mapped_column(ForeignKey("monitors.id"), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    service: Mapped[str] = mapped_column(String(120), nullable=False)
    environment: Mapped[str] = mapped_column(String(80), nullable=False)
    owner: Mapped[str] = mapped_column(String(120), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    runbook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor: Mapped[str] = mapped_column(String(80), nullable=False, default="system")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_id: Mapped[int | None] = mapped_column(ForeignKey("monitors.id"), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
