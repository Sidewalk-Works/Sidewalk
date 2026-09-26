import uuid
from fastapi import APIRouter, Depends
from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.core.pagination import PageParams, PaginatedResponse
from src.modules.notifications import service as notifications_service
from src.modules.notifications.schemas import NotificationResponse, ReadAllResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedResponse[NotificationResponse])
async def list_notifications(
    current_user: CurrentUser,
    db: DBSession,
    params: PageParams = Depends(),
    unread_only: bool = False,
) -> PaginatedResponse[NotificationResponse]:
    items, total = await notifications_service.list_notifications(
        db,
        user_id=current_user.id,
        limit=params.limit,
        offset=params.offset,
        unread_only=unread_only,
    )
    return PaginatedResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        limit=params.limit,
        offset=params.offset,
        has_more=(params.offset + len(items)) < total,
    )


@router.patch("/read-all", response_model=ReadAllResponse)
async def mark_all_notifications_read(
    current_user: CurrentUser,
    db: DBSession,
) -> ReadAllResponse:
    count = await notifications_service.mark_all_read(db, current_user.id)
    return ReadAllResponse(marked_read=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> NotificationResponse:
    notification = await notifications_service.mark_read(db, notification_id, current_user.id)
    return NotificationResponse.model_validate(notification)
