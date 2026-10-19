from fastapi import APIRouter

from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.modules.auth.schemas import AuthResponse
from src.modules.users import service as users_service
from src.modules.users.schemas import (
    ChangePasswordRequest,
    UpdateProfileRequest,
    UserProfileResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: CurrentUser) -> UserProfileResponse:
    return UserProfileResponse.model_validate(current_user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_my_profile(
    payload: UpdateProfileRequest, current_user: CurrentUser, db: DBSession
) -> UserProfileResponse:
    return await users_service.update_profile(db, current_user, payload)


@router.post("/me/password", response_model=AuthResponse)
async def change_my_password(
    payload: ChangePasswordRequest, current_user: CurrentUser, db: DBSession
) -> AuthResponse:
    """Change the password. All older sessions are revoked; the response carries fresh tokens."""
    return await users_service.change_password(db, current_user, payload)
