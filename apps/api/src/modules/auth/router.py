from fastapi import APIRouter, Request

from src.core.config import get_settings
from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.core.limiter import limiter
from src.modules.auth import service as auth_service
from src.modules.auth.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, db: DBSession) -> AuthResponse:
    return await auth_service.register(db, payload)


@router.post("/login", response_model=AuthResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(request: Request, payload: LoginRequest, db: DBSession) -> AuthResponse:
    return await auth_service.login(db, payload)


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(payload: RefreshRequest, db: DBSession) -> AuthResponse:
    """Rotate a refresh token: returns a new access token and a new refresh token."""
    return await auth_service.refresh(db, payload.refresh_token)


@router.post("/logout", status_code=204)
async def logout(current_user: CurrentUser, db: DBSession) -> None:
    """Revoke every access and refresh token of the caller."""
    await auth_service.logout(db, current_user)


@router.post("/forgot-password", response_model=MessageResponse, status_code=202)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def forgot_password(
    request: Request, payload: ForgotPasswordRequest, db: DBSession
) -> MessageResponse:
    return await auth_service.forgot_password(db, payload.email)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: DBSession) -> MessageResponse:
    return await auth_service.reset_password(db, payload.token, payload.new_password)


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(payload: TokenRequest, db: DBSession) -> MessageResponse:
    return await auth_service.verify_email(db, payload.token)


@router.post("/confirm-email-change", response_model=MessageResponse)
async def confirm_email_change(payload: TokenRequest, db: DBSession) -> MessageResponse:
    return await auth_service.confirm_email_change(db, payload.token)
