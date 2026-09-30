import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import UserNotFoundError
from src.modules.auth.models import User


async def create_user(
    db: AsyncSession, email: str, password_hash: str, is_admin: bool = False
) -> User:
    user = User(email=email, password_hash=password_hash, is_admin=is_admin)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_id(
    db: AsyncSession, user_id: uuid.UUID, raise_if_not_found: bool = False
) -> User | None:
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None and raise_if_not_found:
        raise UserNotFoundError("User not found")
    return user


async def update_user(db: AsyncSession, user: User, **fields: Any) -> User:
    # is_admin isn't reachable through today's UpdateProfileRequest (it only
    # exposes email), but this generic **fields update is the layer meant to
    # enforce that a caller can never grant privilege escalation through it -
    # relying solely on the current schema not exposing the field would break
    # silently the moment a future schema adds one that does.
    for forbidden in ("id", "password_hash", "created_at", "is_admin"):
        if forbidden in fields:
            raise ValueError(f"Cannot update protected field: {forbidden}")
    for key, value in fields.items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user
