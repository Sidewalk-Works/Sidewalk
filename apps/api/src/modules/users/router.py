from fastapi import APIRouter
from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.modules.users.schemas import UpdateProfileRequest, UserProfileResponse
from src.modules.users import service as users_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: CurrentUser) -> UserProfileResponse:
    return UserProfileResponse.model_validate(current_user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_my_profile(
    payload: UpdateProfileRequest, current_user: CurrentUser, db: DBSession
) -> UserProfileResponse:
    return await users_service.update_profile(db, current_user, payload)
