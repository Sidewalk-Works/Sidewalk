from typing import Annotated
from fastapi import Depends
from src.core.exceptions import ForbiddenError
from src.modules.auth.dependencies import CurrentUser, get_current_user
from src.modules.auth.models import User


async def require_admin(current_user: CurrentUser) -> User:
    if not current_user.is_admin:
        raise ForbiddenError("Admin access required")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]

__all__ = ["CurrentUser", "get_current_user", "require_admin", "AdminUser"]
