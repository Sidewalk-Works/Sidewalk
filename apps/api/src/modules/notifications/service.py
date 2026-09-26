import uuid
from typing import Any
import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.enums import NotificationType
from src.core.exceptions import ForbiddenError, NotFoundError
from src.modules.notifications.models import Notification

log = structlog.get_logger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: NotificationType | str,
    payload: dict[str, Any] | None = None,
) -> Notification:
    if isinstance(type, str):
        type_enum = NotificationType(type)
    else:
        type_enum = type

    notification = Notification(
        user_id=user_id,
        type=type_enum,
        payload=payload or {},
        read=False,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    log.info("create_notification", user_id=str(user_id), notification_id=str(notification.id))
    return notification


async def list_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    query = select(Notification).where(Notification.user_id == user_id)
    count_query = select(func.count()).select_from(Notification).where(Notification.user_id == user_id)

    if unread_only:
        query = query.where(Notification.read == False)  # noqa: E712
        count_query = count_query.where(Notification.read == False)  # noqa: E712

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total


async def mark_read(
    db: AsyncSession,
    notification_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Notification:
    stmt = select(Notification).where(Notification.id == notification_id)
    result = await db.execute(stmt)
    notification = result.scalar_one_or_none()

    if not notification:
        raise NotFoundError("Notification not found")
    if notification.user_id != user_id:
        raise ForbiddenError("Not authorized to access this notification")

    notification.read = True
    await db.commit()
    await db.refresh(notification)
    log.info("mark_notification_read", notification_id=str(notification_id), user_id=str(user_id))
    return notification


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    log.info("mark_all_notifications_read", user_id=str(user_id), count=result.rowcount)
    return result.rowcount


async def count_unread(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id,
        Notification.read == False,  # noqa: E712
    )
    result = await db.execute(stmt)
    return result.scalar() or 0
