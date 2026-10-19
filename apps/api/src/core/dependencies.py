from typing import Annotated

from fastapi import Depends

from src.core.config import get_settings
from src.core.exceptions import ForbiddenError
from src.modules.auth.dependencies import CurrentUser, get_current_user
from src.modules.auth.models import User


async def require_admin(current_user: CurrentUser) -> User:
    if not current_user.is_admin:
        raise ForbiddenError("Admin access required")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]


async def require_verified_email(current_user: CurrentUser) -> User:
    """Policy: with REQUIRE_VERIFIED_EMAIL=true, unverified accounts cannot create content."""
    if get_settings().REQUIRE_VERIFIED_EMAIL and not current_user.email_verified:
        raise ForbiddenError("Verify your email address to continue")
    return current_user


VerifiedUser = Annotated[User, Depends(require_verified_email)]

__all__ = [
    "AdminUser",
    "CurrentUser",
    "VerifiedUser",
    "get_current_user",
    "require_admin",
    "require_verified_email",
]
