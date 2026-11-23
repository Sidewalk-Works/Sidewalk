import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, ValidationInfo, field_validator

from src.core.security import normalize_email

COMMON_PASSWORDS = {
    "12345678",
    "123456789",
    "1234567890",
    "00000000",
    "11111111",
    "abc12345",
    "admin123",
    "dragon",
    "football",
    "iloveyou",
    "monkey",
    "letmein",
    "password",
    "password1",
    "password123",
    "princess",
    "qwerty",
    "qwerty123",
    "sunshine",
    "trustno1",
    "welcome",
}


def password_matches_email_local_part(password: str, email: str) -> bool:
    local_part = email.partition("@")[0]
    return bool(local_part) and password.casefold() == local_part.casefold()


def validate_password_byte_length(v: str) -> str:
    # bcrypt only uses the first 72 bytes, so longer values can collide after truncation.
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 bytes")
    return v


def validate_new_password(v: str, email: str | None = None) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    validate_password_byte_length(v)
    if v.casefold() in COMMON_PASSWORDS:
        raise ValueError("Password is too common")
    if email is not None and password_matches_email_local_part(v, email):
        raise ValueError("Password must not match the email username")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str, info: ValidationInfo) -> str:
        return validate_new_password(v, email=info.data.get("email"))


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        return validate_password_byte_length(v)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_new_password(v)


class TokenRequest(BaseModel):
    token: str


class MessageResponse(BaseModel):
    message: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    is_admin: bool
    email_verified: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenPayload(BaseModel):
    sub: str
    exp: int
