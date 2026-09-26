import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.exceptions import ConflictError, UnauthorizedError
from src.core.security import create_access_token, hash_password, verify_password
from src.modules.auth import repository as auth_repo
from src.modules.auth.schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut

log = structlog.get_logger(__name__)


async def register(db: AsyncSession, payload: RegisterRequest) -> AuthResponse:
    existing = await auth_repo.get_user_by_email(db, payload.email)
    if existing:
        raise ConflictError("A user with this email already exists", field="email")
    hashed = hash_password(payload.password)
    user = await auth_repo.create_user(db, payload.email, hashed)
    await db.commit()
    log.info("register_user", user_id=str(user.id), email=user.email)
    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


async def login(db: AsyncSession, payload: LoginRequest) -> AuthResponse:
    user = await auth_repo.get_user_by_email(db, payload.email)
    if not user:
        raise UnauthorizedError("Invalid credentials")
    if not verify_password(payload.password, user.password_hash):
        raise UnauthorizedError("Invalid credentials")
    if not user.is_active:
        raise UnauthorizedError("Account inactive")
    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))
