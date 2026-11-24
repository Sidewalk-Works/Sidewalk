import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    report_id: uuid.UUID
    title: str
    description: str
    status: str
    assigned_to_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class CaseDetailResponse(CaseResponse):
    follower_count: int = 0
    is_following: bool = False
