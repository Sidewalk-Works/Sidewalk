import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import UserNotFoundError
from src.core.security import normalize_email
from src.modules.auth.models import User


async def create_user(
    db: AsyncSession, email: str, password_hash: str, is_admin: bool = False
) -> User:
    user = User(email=normalize_email(email), password_hash=password_hash, is_admin=is_admin)
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    # Compare case-insensitively so accounts created before addresses were normalized
    # are still found; new rows are always stored lower-cased.
    stmt = (
        select(User)
        .where(func.lower(User.email) == normalize_email(email))
        .order_by(User.created_at)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalars().first()


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
    if isinstance(fields.get("email"), str):
        fields["email"] = normalize_email(fields["email"])
    for key, value in fields.items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user
