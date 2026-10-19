import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core import database
from src.core.database import build_engine, normalize_database_url
from src.core.enums import NotificationType
from src.modules.notifications.models import Notification


def test_importing_the_module_does_not_create_an_engine():
    # The engine is only built when get_engine() is first called, never at import time.
    assert not hasattr(database, "engine")


def test_url_normalization_selects_async_drivers():
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert normalize_database_url("sqlite:///./x.db") == "sqlite+aiosqlite:///./x.db"
    assert normalize_database_url("sqlite+aiosqlite:///:memory:") == "sqlite+aiosqlite:///:memory:"


async def test_sqlite_rejects_rows_that_violate_foreign_keys():
    engine = build_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            from src.core.models import Base

            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            session.add(
                Notification(user_id=uuid.uuid4(), type=NotificationType.status_change.value, payload={}, read=False)
            )
            with pytest.raises(IntegrityError):
                await session.flush()
    finally:
        await engine.dispose()
