from dataclasses import dataclass
from datetime import UTC, datetime

from models import MaintenanceWindow
from sqlalchemy import select
from sqlalchemy.orm import Session


@dataclass
class MaintenanceState:
    global_window: MaintenanceWindow | None
    monitor_windows: dict[int, MaintenanceWindow]

    def window_for(self, monitor_id: int) -> MaintenanceWindow | None:
        return self.monitor_windows.get(monitor_id) or self.global_window

    def active_for(self, monitor_id: int) -> bool:
        return self.window_for(monitor_id) is not None


def load_active_maintenance_state(
    db: Session,
    now: datetime | None = None,
) -> MaintenanceState:
    current_time = now or datetime.now(UTC)
    active_windows = db.scalars(
        select(MaintenanceWindow)
        .where(
            MaintenanceWindow.starts_at <= current_time,
            MaintenanceWindow.ends_at >= current_time,
        )
        .order_by(MaintenanceWindow.id.desc())
    ).all()

    global_window = next((window for window in active_windows if window.monitor_id is None), None)
    monitor_windows: dict[int, MaintenanceWindow] = {}
    for window in active_windows:
        if window.monitor_id is None:
            continue
        if window.monitor_id not in monitor_windows:
            monitor_windows[window.monitor_id] = window

    return MaintenanceState(global_window=global_window, monitor_windows=monitor_windows)
