import structlog
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictError, UnauthorizedError
from src.core.security import verify_password_async
from src.modules.auth import repository as user_repository
from src.modules.auth.models import User
from src.modules.cases.models import CaseFollow
from src.modules.notifications.models import Notification
from src.modules.users.schemas import (
    DeleteAccountRequest,
    UpdateProfileRequest,
    UserProfileResponse,
)

log = structlog.get_logger(__name__)


async def update_profile(
    db: AsyncSession, user: User, payload: UpdateProfileRequest
) -> UserProfileResponse:
    """
    Email changes are never applied directly: the caller must prove knowledge of the current
    password, and the new address stays in ``pending_email`` until its owner follows the
    confirmation link (``POST /auth/confirm-email-change``).
    """
    if payload.email is not None and payload.email != user.email:
        existing = await user_repository.get_user_by_email(db, payload.email)
        if existing and existing.id != user.id:
            raise ConflictError(
                "A user with this email already exists", field="email", code="email_taken"
            )
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
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "A user with this email already exists", field="email", code="email_taken"
        ) from None
    log.info("update_profile", user_id=str(user.id))
    return UserProfileResponse.model_validate(updated_user)


async def delete_account(db: AsyncSession, user: User, payload: DeleteAccountRequest) -> None:
    """
    Deactivate and anonymize the current account.

    Behavior:
    - Requires the current password.
    - Marks account inactive, anonymizes email/pending_email, clears verification flags.
    - Bumps token version and revokes auth tokens so existing sessions stop working immediately.
    - Removes case follows and notifications tied to the user.
    - Keeps authored reports in place, now attributed to a deactivated/anonymized account.
    """
    if not await verify_password_async(payload.current_password, user.password_hash):
        raise UnauthorizedError("Invalid credentials", code="invalid_credentials")

    user.is_active = False
    user.email = f"deleted+{user.id}@deleted.sidewalk.invalid"
    user.pending_email = None
    user.email_verified = False
    await user_repository.bump_token_version(db, user)
    await user_repository.revoke_user_tokens(db, user.id, "refresh")
    await user_repository.revoke_user_tokens(db, user.id, "password_reset")
    await user_repository.revoke_user_tokens(db, user.id, "email_verify")
    await user_repository.revoke_user_tokens(db, user.id, "email_change")
    await db.execute(delete(CaseFollow).where(CaseFollow.user_id == user.id))
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.flush()
    log.info("delete_account", user_id=str(user.id))
