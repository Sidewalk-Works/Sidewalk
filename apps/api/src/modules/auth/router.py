from fastapi import APIRouter, Request
from src.core.config import get_settings
from src.core.database import DBSession
from src.core.limiter import limiter
from src.modules.auth.dependencies import CurrentUser
from src.modules.auth.schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut
from src.modules.auth import service as auth_service

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
