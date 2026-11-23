import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from src.core.enums import NotificationType


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    type: NotificationType
    payload: dict[str, Any] = {}
    read: bool
    created_at: datetime
    updated_at: datetime


class ReadAllResponse(BaseModel):
    marked_read: int
