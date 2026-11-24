from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_session
from src.modules.auth.dependencies import require_admin
from src.modules.users.models import User, UserRole

router = APIRouter(prefix="/admin/users", tags=["admin"])


class AdminUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: UserRole
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRead]
    total: int
    limit: int
    offset: int


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


@router.get(
    "",
    response_model=AdminUserListResponse,
    summary="List all users (admin only)",
)
async def list_users(
    _: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    role: Annotated[UserRole | None, Query(description="Filter by role")] = None,
    is_active: Annotated[bool | None, Query(description="Filter by active status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role.value)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)

    total = (
        await session.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()

    users = list(
        (
            await session.execute(
                stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return AdminUserListResponse(
        items=[AdminUserRead.model_validate(u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/{user_id}",
    response_model=AdminUserRead,
    summary="Update a user's role or active status (admin only)",
)
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    admin_user: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserRead:
    target = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target.id == admin_user.id:
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot deactivate their own account",
            )
        if payload.role is not None and payload.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot remove their own admin role",
            )

    if payload.role is not None:
        target.role = payload.role.value
        target.is_admin = payload.role == UserRole.ADMIN
    if payload.is_active is not None:
        target.is_active = payload.is_active

    await session.commit()
    await session.refresh(target)
    return AdminUserRead.model_validate(target)
