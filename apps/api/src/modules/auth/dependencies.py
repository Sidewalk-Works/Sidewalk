import uuid
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.database import DBSession
from src.core.exceptions import TokenInvalidError, UnauthorizedError
from src.core.security import decode_access_token
from src.modules.auth import repository as auth_repo
from src.modules.auth.models import User

log = structlog.get_logger(__name__)

# auto_error=False so a missing header is reported through the same AppError path
# (401 + WWW-Authenticate) as every other authentication failure.
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security_scheme)],
    db: DBSession,
) -> User:
    if credentials is None:
        raise UnauthorizedError("Not authenticated")

    payload = decode_access_token(credentials.credentials)  # TokenExpiredError / TokenInvalidError
    try:
        user_id = uuid.UUID(str(payload.get("sub", "")))
    except ValueError:
        log.warning("token_rejected", reason="bad_subject")
        raise TokenInvalidError("Invalid or expired token") from None

    user = await auth_repo.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    if payload.get("tv", 0) != user.token_version:
        log.info("token_rejected", reason="revoked", user_id=str(user.id))
        raise TokenInvalidError("Invalid or expired token")
    structlog.contextvars.bind_contextvars(user_id=str(user.id))
    # The access log runs outside this task; it reads the id from the shared ASGI scope.
    request.state.user_id = str(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
