import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, model_validator


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None

    @model_validator(mode="after")
    def check_not_empty(self) -> "UpdateProfileRequest":
        if self.email is None:
            raise ValueError("At least one field must be provided for update")
        return self
