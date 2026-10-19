from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import bcrypt
import jwt

from src.core.config import get_settings
from src.core.exceptions import InvalidTokenError


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
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(f"Invalid or expired token: {exc}") from exc


def normalize_email(email: str) -> str:
    """Canonical form used for every stored and looked-up address: trimmed and lower-cased."""
    return email.strip().lower()


@lru_cache
def _dummy_password_hash() -> str:
    return hash_password("sidewalk-timing-equalizer")


def burn_password_check(plain: str) -> None:
    """Spend the same time as a real verification, for logins that name no existing account."""
    verify_password(plain, _dummy_password_hash())
