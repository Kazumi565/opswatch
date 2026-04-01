from audit_log import record_audit_event
from deps import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from models import User, UserRole
from schemas import UserCreate, UserOut, UserUpdate
from security import (
    AuthContext,
    hash_password,
    normalize_email,
    require_admin_context,
    require_admin_read_context,
    revoke_user_sessions,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/users", tags=["users"])


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return user


def count_active_admins(db: Session, *, excluding_user_id: int | None = None) -> int:
    stmt = (
        select(func.count())
        .select_from(User)
        .where(
            User.role == UserRole.admin,
            User.is_active.is_(True),
        )
    )
    if excluding_user_id is not None:
        stmt = stmt.where(User.id != excluding_user_id)
    return int(db.scalar(stmt) or 0)


def ensure_admin_safety(
    db: Session,
    *,
    actor: AuthContext,
    target_user: User,
    next_role: UserRole,
    next_is_active: bool,
) -> None:
    if actor.user and actor.user.id == target_user.id:
        if not next_is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="admins cannot deactivate themselves",
            )
        if next_role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="admins cannot change their own role",
            )

    removing_admin_privileges = target_user.role == UserRole.admin and next_role != UserRole.admin
    deactivating_admin = (
        target_user.role == UserRole.admin and target_user.is_active and not next_is_active
    )

    if (removing_admin_privileges or deactivating_admin) and count_active_admins(
        db,
        excluding_user_id=target_user.id,
    ) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="at least one active admin must remain",
        )


@router.get("", response_model=list[UserOut])
def list_users(
    _auth: AuthContext = Depends(require_admin_read_context),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(User).order_by(User.email.asc(), User.id.asc())).all())


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_admin_context),
):
    email = normalize_email(payload.email)
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        raise HTTPException(status_code=409, detail="user with that email already exists")

    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role=UserRole(payload.role),
        is_active=payload.is_active,
    )
    db.add(user)
    db.flush()
    record_audit_event(
        db,
        actor=auth.actor,
        action="user.create",
        resource_type="user",
        resource_id=user.id,
        summary_json={
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role.value,
            "is_active": user.is_active,
        },
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_admin_context),
):
    user = get_user_or_404(db, user_id)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return user

    if "email" in data:
        normalized_email = normalize_email(data["email"])
        existing_user = db.scalar(
            select(User).where(User.email == normalized_email, User.id != user.id)
        )
        if existing_user:
            raise HTTPException(status_code=409, detail="user with that email already exists")
        data["email"] = normalized_email

    next_role = UserRole(data.get("role", user.role))
    next_is_active = bool(data.get("is_active", user.is_active))
    ensure_admin_safety(
        db,
        actor=auth,
        target_user=user,
        next_role=next_role,
        next_is_active=next_is_active,
    )

    changed_fields: dict[str, dict[str, str | bool | None]] = {}
    role_changed = "role" in data and next_role != user.role
    active_changed = "is_active" in data and next_is_active != user.is_active
    password_changed = "password" in data and bool(data["password"])

    for field_name in ("email", "display_name"):
        if field_name in data:
            new_value = (
                data[field_name].strip() if isinstance(data[field_name], str) else data[field_name]
            )
            old_value = getattr(user, field_name)
            if new_value != old_value:
                changed_fields[field_name] = {"before": old_value, "after": new_value}
                setattr(user, field_name, new_value)

    if role_changed:
        changed_fields["role"] = {"before": user.role.value, "after": next_role.value}
        user.role = next_role

    if active_changed:
        changed_fields["is_active"] = {"before": user.is_active, "after": next_is_active}
        user.is_active = next_is_active

    if password_changed:
        user.password_hash = hash_password(data["password"])
        changed_fields["password"] = {"before": None, "after": True}

    if not changed_fields:
        return user

    if role_changed:
        record_audit_event(
            db,
            actor=auth.actor,
            action="user.role.change",
            resource_type="user",
            resource_id=user.id,
            summary_json=changed_fields["role"],
        )

    if active_changed:
        record_audit_event(
            db,
            actor=auth.actor,
            action="user.reactivate" if next_is_active else "user.deactivate",
            resource_type="user",
            resource_id=user.id,
            summary_json={"email": user.email, "is_active": next_is_active},
        )

    generic_changes = {
        key: value for key, value in changed_fields.items() if key not in {"role", "is_active"}
    }
    if generic_changes:
        record_audit_event(
            db,
            actor=auth.actor,
            action="user.update",
            resource_type="user",
            resource_id=user.id,
            summary_json=generic_changes,
        )

    db.commit()
    if active_changed and not next_is_active:
        revoke_user_sessions(db, user_id=user.id)
    db.refresh(user)
    return user
