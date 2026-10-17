import uuid
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.database import DBSession
from src.core.exceptions import InvalidTokenError
from src.core.security import decode_access_token
from src.modules.auth import repository as auth_repo
from src.modules.auth.models import User

security_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security_scheme)],
    db: DBSession,
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id = uuid.UUID(user_id_str)
    except (InvalidTokenError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    user = await auth_repo.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    structlog.contextvars.bind_contextvars(user_id=str(user.id))
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
