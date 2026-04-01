from audit_log import record_audit_event
from deps import get_db
from fastapi import APIRouter, Depends, HTTPException, Response, status
from models import User
from schemas import AuthLoginIn, AuthMeOut
from security import (
    AuthContext,
    clear_auth_cookies,
    create_session,
    ensure_utc,
    normalize_email,
    require_authenticated_context,
    require_authenticated_mutation_context,
    set_auth_cookies,
    utc_now,
    verify_password,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def serialize_auth_context(auth: AuthContext) -> AuthMeOut:
    if auth.user is None:
        return AuthMeOut(
            id=None,
            email="api_key",
            display_name="Automation API key",
            role="admin",
            is_active=True,
            auth_method="api_key",
            last_login_at=None,
            session_expires_at=None,
        )

    return AuthMeOut(
        id=auth.user.id,
        email=auth.user.email,
        display_name=auth.user.display_name,
        role=auth.user.role,
        is_active=auth.user.is_active,
        auth_method=auth.auth_method,
        last_login_at=ensure_utc(auth.user.last_login_at) if auth.user.last_login_at else None,
        session_expires_at=ensure_utc(auth.session.expires_at) if auth.session else None,
    )


@router.post("/login", response_model=AuthMeOut)
def login(
    payload: AuthLoginIn,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.email == normalize_email(payload.email)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user is inactive",
        )

    session, session_token, csrf_token = create_session(db, user=user)
    record_audit_event(
        db,
        actor=user.email,
        action="auth.login",
        resource_type="session",
        resource_id=session.id,
        summary_json={"user_id": user.id},
    )
    db.commit()
    db.refresh(user)
    db.refresh(session)

    set_auth_cookies(
        response,
        session_token=session_token,
        csrf_token=csrf_token,
        expires_at=session.expires_at,
    )
    return serialize_auth_context(
        AuthContext(
            actor=user.email,
            role=user.role,
            auth_method="session",
            user=user,
            session=session,
        )
    )


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_authenticated_mutation_context),
):
    if auth.session is not None:
        auth.session.revoked_at = utc_now()
        record_audit_event(
            db,
            actor=auth.actor,
            action="auth.logout",
            resource_type="session",
            resource_id=auth.session.id,
            summary_json={"user_id": auth.user.id if auth.user else None},
        )
        db.commit()
    clear_auth_cookies(response)
    return None


@router.get("/me", response_model=AuthMeOut)
def me(auth: AuthContext = Depends(require_authenticated_context)):
    return serialize_auth_context(auth)
