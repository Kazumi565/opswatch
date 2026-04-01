from deps import get_db
from fastapi import APIRouter, Depends
from models import AuditEvent
from schemas import AuditEventOut
from security import require_admin_read_context
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"],
    dependencies=[Depends(require_admin_read_context)],
)


def clamp_limit(limit: int) -> int:
    return max(1, min(limit, 500))


@router.get("", response_model=list[AuditEventOut])
def list_audit_events(
    limit: int = 100,
    resource_type: str | None = None,
    resource_id: int | None = None,
    db: Session = Depends(get_db),
):
    limit = clamp_limit(limit)

    stmt = (
        select(AuditEvent).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit)
    )

    if resource_type:
        stmt = stmt.where(AuditEvent.resource_type == resource_type)

    if resource_id is not None:
        stmt = stmt.where(AuditEvent.resource_id == resource_id)

    return list(db.scalars(stmt).all())
