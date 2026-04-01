import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from config import settings
from deps import get_db
from fastapi import Depends, Header, HTTPException, Request, Response, status
from models import AuthSession, User, UserRole
from passlib.context import CryptContext
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

PASSWORD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_COOKIE_NAME = "opswatch_session"
CSRF_COOKIE_NAME = "opswatch_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)
SESSION_CLEANUP_RETENTION = timedelta(days=7)


@dataclass
class AuthContext:
    actor: str
    role: UserRole
    auth_method: str
    user: User | None = None
    session: AuthSession | None = None


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return PASSWORD_CONTEXT.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return PASSWORD_CONTEXT.verify(password, password_hash)


def session_ttl() -> timedelta:
    return timedelta(hours=settings.opswatch_session_ttl_hours)


def _hash_token(token: str) -> str:
    return hmac.new(
        settings.auth_secret.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def cleanup_expired_sessions(db: Session, *, now: datetime | None = None) -> None:
    current_time = now or utc_now()
    revoked_before = current_time - SESSION_CLEANUP_RETENTION
    result = db.execute(
        delete(AuthSession).where(
            (AuthSession.expires_at < current_time)
            | (AuthSession.revoked_at.is_not(None) & (AuthSession.revoked_at < revoked_before))
        )
    )
    if result.rowcount:
        db.commit()


def revoke_user_sessions(db: Session, *, user_id: int, now: datetime | None = None) -> int:
    current_time = now or utc_now()
    result = db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user_id,
            (AuthSession.revoked_at.is_(None) | (AuthSession.revoked_at > current_time)),
        )
    )
    if result.rowcount:
        db.commit()
    return result.rowcount or 0


def create_session(
    db: Session,
    *,
    user: User,
    now: datetime | None = None,
) -> tuple[AuthSession, str, str]:
    current_time = now or utc_now()
    cleanup_expired_sessions(db, now=current_time)

    session_token = generate_session_token()
    csrf_token = generate_csrf_token()
    session = AuthSession(
        user_id=user.id,
        token_hash=_hash_token(session_token),
        created_at=current_time,
        expires_at=current_time + session_ttl(),
        last_seen_at=current_time,
    )
    user.last_login_at = current_time
    db.add(session)
    db.flush()
    return session, session_token, csrf_token


def set_auth_cookies(
    response: Response,
    *,
    session_token: str,
    csrf_token: str,
    expires_at: datetime,
) -> None:
    expires_at_utc = ensure_utc(expires_at)
    max_age = max(0, int((expires_at_utc - utc_now()).total_seconds()))
    common_kwargs = {
        "secure": settings.opswatch_auth_cookie_secure,
        "samesite": "lax",
        "path": "/",
        "max_age": max_age,
    }
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_token,
        httponly=True,
        **common_kwargs,
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        **common_kwargs,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=settings.opswatch_auth_cookie_secure,
        samesite="lax",
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.opswatch_auth_cookie_secure,
        samesite="lax",
    )


def _session_context(
    db: Session,
    *,
    session_token: str,
    now: datetime | None = None,
) -> AuthContext:
    current_time = now or utc_now()
    cleanup_expired_sessions(db, now=current_time)

    session = db.scalar(
        select(AuthSession)
        .where(AuthSession.token_hash == _hash_token(session_token))
        .options(selectinload(AuthSession.user))
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session expired or invalid",
        )

    expires_at = ensure_utc(session.expires_at)
    revoked_at = ensure_utc(session.revoked_at) if session.revoked_at is not None else None
    last_seen_at = ensure_utc(session.last_seen_at)
    if revoked_at is not None or expires_at <= current_time:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session expired or invalid",
        )

    user = session.user
    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session expired or invalid",
        )

    if current_time - last_seen_at >= SESSION_TOUCH_INTERVAL:
        session.last_seen_at = current_time
        db.commit()
        db.refresh(session)

    return AuthContext(
        actor=user.email,
        role=user.role,
        auth_method="session",
        user=user,
        session=session,
    )


def _api_key_context(x_api_key: str | None) -> AuthContext | None:
    expected_api_key = settings.opswatch_api_key
    if not x_api_key:
        return None
    if not expected_api_key or x_api_key != expected_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid api key",
        )
    return AuthContext(
        actor="api_key",
        role=UserRole.admin,
        auth_method="api_key",
    )


def _resolve_auth_context(
    request: Request,
    db: Session,
    x_api_key: str | None,
) -> AuthContext:
    api_key_context = _api_key_context(x_api_key)
    if api_key_context is not None:
        return api_key_context

    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    return _session_context(db, session_token=session_token)


def _require_role(auth: AuthContext, allowed_roles: set[UserRole]) -> AuthContext:
    if auth.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="insufficient permissions",
        )
    return auth


def enforce_csrf(request: Request, auth: AuthContext) -> None:
    if auth.auth_method != "session":
        return
    csrf_header = request.headers.get(CSRF_HEADER_NAME)
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    if not csrf_header or not csrf_cookie or not secrets.compare_digest(csrf_header, csrf_cookie):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="csrf validation failed",
        )


def require_authenticated_context(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> AuthContext:
    return _resolve_auth_context(request, db, x_api_key)


def require_authenticated_mutation_context(
    request: Request,
    auth: AuthContext = Depends(require_authenticated_context),
) -> AuthContext:
    enforce_csrf(request, auth)
    return auth


def require_programmer_context(
    request: Request,
    auth: AuthContext = Depends(require_authenticated_context),
) -> AuthContext:
    enforce_csrf(request, auth)
    return _require_role(auth, {UserRole.programmer, UserRole.admin})


def require_admin_read_context(
    auth: AuthContext = Depends(require_authenticated_context),
) -> AuthContext:
    return _require_role(auth, {UserRole.admin})


def require_admin_context(
    request: Request,
    auth: AuthContext = Depends(require_authenticated_context),
) -> AuthContext:
    enforce_csrf(request, auth)
    return _require_role(auth, {UserRole.admin})
