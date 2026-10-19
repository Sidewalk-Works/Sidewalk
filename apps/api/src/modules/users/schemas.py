import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_admin: bool
    email_verified: bool = False
    pending_email: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    # Required whenever ``email`` changes: a stolen token alone must not be able to repoint
    # the account's recovery address.
    current_password: str | None = None

    @model_validator(mode="after")
    def check_not_empty(self) -> "UpdateProfileRequest":
        if self.email is None:
            raise ValueError("At least one field must be provided for update")
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 bytes")
        return v
