import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
import structlog

from src.core.config import get_settings
from src.core.exceptions import TokenExpiredError, TokenInvalidError

log = structlog.get_logger(__name__)


def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_minutes: int | None = None) -> str:
    settings = get_settings()
    minutes = expires_minutes if expires_minutes is not None else settings.JWT_EXPIRES_MINUTES
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=minutes)
    to_encode.update({"exp": expire, "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and verify an access token. Expired and otherwise-invalid tokens raise different
    errors so clients can tell "refresh" from "sign in again". The underlying reason is logged
    here and never included in the response.
    """
    settings = get_settings()
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        log.info("token_rejected", reason="expired")
        raise TokenExpiredError("Token has expired") from None
    except jwt.PyJWTError as exc:
        log.warning("token_rejected", reason="invalid", error=f"{type(exc).__name__}: {exc}")
        raise TokenInvalidError("Invalid or expired token") from None


def generate_token() -> str:
    """A fresh opaque secret for refresh, reset, verification and email-change tokens."""
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    """Tokens are stored as SHA-256 digests so a database leak does not expose live secrets."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
