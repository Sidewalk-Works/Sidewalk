from datetime import UTC, datetime, timedelta
from typing import Any

import anyio.to_thread
import bcrypt
import jwt

from src.core.config import get_settings
from src.core.exceptions import InvalidTokenError, ValidationError

# bcrypt only reads the first 72 bytes of its input; longer values are rejected, never truncated.
MAX_PASSWORD_BYTES = 72


def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        raise ValidationError(f"Password must not exceed {MAX_PASSWORD_BYTES} bytes")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def hash_password_async(plain: str) -> str:
    """``hash_password`` in a worker thread, so bcrypt never blocks the event loop."""
    return await anyio.to_thread.run_sync(hash_password, plain)


async def verify_password_async(plain: str, hashed: str) -> bool:
    """``verify_password`` in a worker thread, so bcrypt never blocks the event loop."""
    return await anyio.to_thread.run_sync(verify_password, plain, hashed)


def create_access_token(data: dict[str, Any], expires_minutes: int | None = None) -> str:
    settings = get_settings()
    minutes = expires_minutes if expires_minutes is not None else settings.JWT_EXPIRES_MINUTES
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(f"Invalid or expired token: {exc}") from exc
