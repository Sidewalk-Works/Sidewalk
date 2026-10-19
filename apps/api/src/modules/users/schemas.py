import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

from src.core.security import normalize_email


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

    @field_validator("email")
    @classmethod
    def normalize(cls, v: str | None) -> str | None:
        return normalize_email(v) if v is not None else v

    @model_validator(mode="after")
    def check_not_empty(self) -> "UpdateProfileRequest":
        if self.email is None:
            raise ValueError("At least one field must be provided for update")
        return self
