from datetime import UTC, datetime

from opswatch_worker.models import CheckRun, MaintenanceWindow, Monitor
from sqlalchemy import or_, select, text


def now_utc():
    return datetime.now(UTC)


def evaluate_incident(db, monitor_id: int) -> None:
    # Load threshold (default 3)
    m = db.scalar(select(Monitor).where(Monitor.id == monitor_id))
    if not m:
        return

    threshold = int(getattr(m, "incident_threshold", 3) or 3)
    if threshold < 1:
        threshold = 1

    # Latest run
    latest = db.scalar(
        select(CheckRun)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.id.desc())
        .limit(1)
    )
    if not latest:
        return

    success = latest.success

    now = now_utc()

    mw = db.execute(
        select(MaintenanceWindow)
        .where(
            MaintenanceWindow.starts_at <= now,
            MaintenanceWindow.ends_at >= now,
            or_(
                MaintenanceWindow.monitor_id == monitor_id,
                MaintenanceWindow.monitor_id.is_(None),
            ),
        )
        .order_by(MaintenanceWindow.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    maintenance_active = mw is not None

    if maintenance_active:
        print(
            f"[maintenance] active for monitor={monitor_id} window_id={mw.id} "
            f"ends_at={mw.ends_at} reason={mw.reason!r}"
        )

    # Check for open incident
    open_inc = db.execute(
        text(
            """
            SELECT id
            FROM incidents
            WHERE monitor_id = :mid AND status = 'open'
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {"mid": monitor_id},
    ).fetchone()

    if maintenance_active:
        if open_inc:
            db.execute(
                text(
                    """
                    UPDATE incidents
                    SET status='resolved', resolved_at=:now
                    WHERE id=:id
                    """
                ),
                {"id": open_inc.id, "now": now},
            )
        return

    if success:
        # resolve if open
        if open_inc:
            db.execute(
                text(
                    """
                    UPDATE incidents
                    SET status='resolved', resolved_at=:now
                    WHERE id=:id
                    """
                ),
                {"id": open_inc.id, "now": now},
            )
        return

    # Compute consecutive failures
    recent = db.execute(
        select(CheckRun.success, CheckRun.error)
        .where(CheckRun.monitor_id == monitor_id)
        .order_by(CheckRun.id.desc())
        .limit(200)
    ).all()

    consec = 0
    last_err = latest.error

    for s, err in recent:
        if s:
            break
        consec += 1
        if last_err is None and err:
            last_err = err

    if open_inc:
        db.execute(
            text(
                """
                UPDATE incidents
                SET failure_count=:fc, last_error=:err
                WHERE id=:id
                """
            ),
            {"id": open_inc.id, "fc": consec, "err": last_err},
        )
        return

    if consec >= threshold:
        db.execute(
            text(
                """
                INSERT INTO incidents (monitor_id, status, opened_at, failure_count, last_error)
                VALUES (:mid, 'open', :now, :fc, :err)
                 """
            ),
            {"mid": monitor_id, "now": now, "fc": consec, "err": last_err},
        )
