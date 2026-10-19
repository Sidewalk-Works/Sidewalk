from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings
from src.core.exceptions import (
    ConflictError,
    ForbiddenError,
    TokenInvalidError,
    UnauthorizedError,
)
from src.core.mail import Message, action_link, get_mail_backend
from src.core.security import (
    create_access_token,
    generate_token,
    hash_password,
    hash_token,
    verify_password,
)
from src.modules.auth import repository as auth_repo
from src.modules.auth.models import AuthToken, User
from src.modules.auth.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserOut,
)

log = structlog.get_logger(__name__)

REFRESH = "refresh"
PASSWORD_RESET = "password_reset"
EMAIL_VERIFY = "email_verify"
EMAIL_CHANGE = "email_change"

GENERIC_FORGOT_PASSWORD = "If an account exists for that email, a reset link has been sent."


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    # SQLite returns naive datetimes; they are always stored as UTC.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def _issue_secret(
    db: AsyncSession, user: User, kind: str, lifetime: timedelta, extra: str | None = None
) -> str:
    raw = generate_token()
    await auth_repo.create_auth_token(
        db, user.id, kind, hash_token(raw), _now() + lifetime, extra=extra
    )
    return raw


async def _consume_secret(db: AsyncSession, kind: str, raw: str) -> AuthToken:
    """Look up a single-use token and mark it used; reject unknown, used or expired ones."""
    token = await auth_repo.get_auth_token(db, kind, hash_token(raw))
    if token is None or token.used_at is not None or _aware(token.expires_at) <= _now():
        raise TokenInvalidError("Invalid or expired token")
    token.used_at = _now()
    await db.flush()
    return token


async def issue_tokens(db: AsyncSession, user: User) -> AuthResponse:
    settings = get_settings()
    access = create_access_token({"sub": str(user.id), "tv": user.token_version})
    refresh = await _issue_secret(
        db, user, REFRESH, timedelta(days=settings.REFRESH_TOKEN_EXPIRES_DAYS)
    )
    return AuthResponse(
        access_token=access, refresh_token=refresh, user=UserOut.model_validate(user)
    )


async def _send_verification_email(db: AsyncSession, user: User) -> None:
    settings = get_settings()
    raw = await _issue_secret(
        db, user, EMAIL_VERIFY, timedelta(hours=settings.EMAIL_TOKEN_EXPIRES_HOURS)
    )
    await get_mail_backend().send(
        Message(
            to=user.email,
            subject="Verify your Sidewalk email",
            body=f"Confirm your email address: {action_link('verify-email', raw)}",
        )
    )


async def register(db: AsyncSession, payload: RegisterRequest) -> AuthResponse:
    existing = await auth_repo.get_user_by_email(db, payload.email)
    if existing:
        raise ConflictError("A user with this email already exists", field="email", code="email_taken")
    hashed = hash_password(payload.password)
    # The get_user_by_email check above is not atomic with the insert below:
    # two concurrent registrations for the same email can both pass it and
    # both reach create_user, in which case the users.email unique
    # constraint raises IntegrityError for whichever commits second. Catch
    # it here and surface it as the same graceful ConflictError, rather than
    # letting a raw IntegrityError bubble up as an unhandled 500.
    try:
        user = await auth_repo.create_user(db, payload.email, hashed)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "A user with this email already exists", field="email", code="email_taken"
        ) from None
    log.info("register_user", user_id=str(user.id), email=user.email)
    await _send_verification_email(db, user)
    response = await issue_tokens(db, user)
    await db.commit()
    return response


async def login(db: AsyncSession, payload: LoginRequest) -> AuthResponse:
    user = await auth_repo.get_user_by_email(db, payload.email)
    if not user:
        raise UnauthorizedError("Invalid credentials", code="invalid_credentials")
    if not verify_password(payload.password, user.password_hash):
        raise UnauthorizedError("Invalid credentials", code="invalid_credentials")
    if not user.is_active:
        raise UnauthorizedError("Account inactive", code="account_inactive")
    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))
