import uuid

import pytest

from src.core.exceptions import UserNotFoundError
from src.modules.auth.repository import create_user, get_user_by_id, update_user


async def test_update_user_field(db_session):
    user = await create_user(db_session, "user1@example.com", "hash123")
    updated = await update_user(db_session, user, email="new@example.com")
    assert updated.email == "new@example.com"


async def test_update_user_protected_fields_raise(db_session):
    user = await create_user(db_session, "user2@example.com", "hash123")
    with pytest.raises(ValueError, match="Cannot update protected field"):
        await update_user(db_session, user, password_hash="newhash")
    with pytest.raises(ValueError, match="Cannot update protected field"):
        await update_user(db_session, user, id=uuid.uuid4())
    with pytest.raises(ValueError, match="Cannot update protected field"):
        await update_user(db_session, user, created_at=None)


async def test_get_user_by_id_not_found(db_session):
    non_existent = uuid.uuid4()
    assert await get_user_by_id(db_session, non_existent) is None
    with pytest.raises(UserNotFoundError):
        await get_user_by_id(db_session, non_existent, raise_if_not_found=True)
