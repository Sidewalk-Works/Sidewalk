import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictError
from src.modules.auth import repository as user_repository
from src.modules.auth.models import User
from src.modules.users.schemas import UpdateProfileRequest, UserProfileResponse

log = structlog.get_logger(__name__)


async def update_profile(
    db: AsyncSession, user: User, payload: UpdateProfileRequest
) -> UserProfileResponse:
    if payload.email is not None and payload.email != user.email:
        existing = await user_repository.get_user_by_email(db, payload.email)
        if existing and existing.id != user.id:
            raise ConflictError("A user with this email already exists", field="email")
    update_data = payload.model_dump(exclude_none=True)
    # The existing-email check above isn't atomic with the update below:
    # two concurrent PATCH /users/me calls changing different accounts to
    # the same new email can both pass it and both reach update_user,
    # so whichever commits second hits the users.email unique constraint
    # and raises a raw IntegrityError instead of the same graceful
    # ConflictError the pre-check already gives the non-race case (mirrors
    # the equivalent fix in auth/service.py's register()).
    try:
        updated_user = await user_repository.update_user(db, user, **update_data)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("A user with this email already exists", field="email") from None
    log.info("update_profile", user_id=str(user.id))
    return UserProfileResponse.model_validate(updated_user)
