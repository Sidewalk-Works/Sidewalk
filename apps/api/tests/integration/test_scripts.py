from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from scripts.reset_db import reset_database
from scripts.seed import seed
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.core.config import get_async_database_url, get_settings
from src.models import Case, Report, User


async def test_seed_idempotency_against_temporary_sqlite(tmp_path: Path):
    db_file = tmp_path / "smoke_seed.db"
    db_url = f"sqlite:///{db_file.as_posix()}"
    async_url = get_async_database_url(db_url)

    # First seed run: initializes tables and seeds rows
    await seed(database_url=db_url)

    engine = create_async_engine(async_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as session:
        user_count = (await session.execute(select(func.count(User.id)))).scalar_one()
        report_count = (await session.execute(select(func.count(Report.id)))).scalar_one()
        case_count = (await session.execute(select(func.count(Case.id)))).scalar_one()

        assert user_count == 3
        assert report_count == 10
        assert case_count == 3
    await engine.dispose()

    # Second seed run: must be idempotent and not create duplicate records
    await seed(database_url=db_url)

    engine = create_async_engine(async_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as session:
        user_count_2 = (await session.execute(select(func.count(User.id)))).scalar_one()
        report_count_2 = (await session.execute(select(func.count(Report.id)))).scalar_one()
        case_count_2 = (await session.execute(select(func.count(Case.id)))).scalar_one()

        assert user_count_2 == user_count == 3
        assert report_count_2 == report_count == 10
        assert case_count_2 == case_count == 3
    await engine.dispose()


@pytest.mark.parametrize("env", ["production", "staging"])
async def test_reset_db_guard_refuses_non_development_without_confirm(monkeypatch, env: str):
    monkeypatch.setenv("ENVIRONMENT", env)
    monkeypatch.setenv("SECRET_KEY", "a-secure-production-secret-key-with-at-least-32-chars")
    get_settings.cache_clear()

    try:
        with pytest.raises(SystemExit) as exc_info:
            await reset_database(confirm=False)
        assert exc_info.value.code == 1
    finally:
        get_settings.cache_clear()


async def test_reset_db_guard_allows_non_development_with_confirm(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "a-secure-production-secret-key-with-at-least-32-chars")
    get_settings.cache_clear()

    try:
        # Mock actual database mutation and subprocess to test that the guard condition passes
        with (
            patch("scripts.reset_db.create_async_engine") as mock_engine,
            patch("scripts.reset_db.subprocess.run") as mock_subprocess,
            patch("scripts.reset_db.seed", new_callable=AsyncMock) as mock_seed,
        ):
            mock_subprocess.return_value.returncode = 0
            mock_conn = AsyncMock()
            mock_engine.return_value.begin.return_value.__aenter__.return_value = mock_conn
            mock_engine.return_value.dispose = AsyncMock()

            # When confirm=True, the guard should not exit
            await reset_database(confirm=True)
            mock_seed.assert_awaited_once()
    finally:
        get_settings.cache_clear()
