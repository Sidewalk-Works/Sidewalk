import uuid

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core import database
from src.core.config import get_async_database_url
from src.core.database import build_engine
from src.core.enums import NotificationType
from src.modules.notifications.models import Notification


def test_importing_the_module_does_not_create_an_engine():
    # The engine is only built when get_engine() is first called, never at import time.
    assert not hasattr(database, "engine")


def test_url_normalization_selects_async_drivers():
    assert get_async_database_url("postgresql://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert get_async_database_url("sqlite:///./x.db") == "sqlite+aiosqlite:///./x.db"
    assert (
        get_async_database_url("sqlite+aiosqlite:///:memory:")
        == "sqlite+aiosqlite:///:memory:"
    )


def test_url_normalization_uses_settings_when_no_url_is_supplied(monkeypatch):
    from src.core import config

    monkeypatch.setattr(config.settings, "DATABASE_URL", "postgresql://u:p@h/db")

    assert get_async_database_url() == "postgresql+asyncpg://u:p@h/db"


async def test_sqlite_rejects_rows_that_violate_foreign_keys():
    engine = build_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            from src.core.models import Base

            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            session.add(
                Notification(
                    user_id=uuid.uuid4(),
                    type=NotificationType.status_change.value,
                    payload={},
                    read=False,
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
    finally:
        await engine.dispose()


async def test_deleting_a_case_cascades_to_follows_in_the_database():
    from src.core.models import Base
    from src.modules.auth.models import User
    from src.modules.cases.models import Case, CaseFollow
    from src.modules.reports.models import Report

    engine = build_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            user = User(email="case-follow@test.com", password_hash="hash")
            report = Report(
                title="Broken sidewalk",
                description="",
                category="road",
                status="submitted",
                user=user,
                media_urls=[],
            )
            case = Case(
                report=report,
                title="Repair sidewalk",
                description="",
            )
            follow = CaseFollow(case=case, user=user)
            session.add_all([user, report, case, follow])
            await session.flush()
            case_id = case.id

            await session.execute(delete(Case).where(Case.id == case_id))
            remaining = await session.scalar(
                select(func.count()).select_from(CaseFollow).where(CaseFollow.case_id == case_id)
            )

            assert remaining == 0
    finally:
        await engine.dispose()


async def test_deleting_a_user_preserves_reports_but_removes_user_owned_relations():
    from src.core.models import Base
    from src.modules.auth.models import User
    from src.modules.cases.models import Case, CaseFollow
    from src.modules.reports.models import Report

    engine = build_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with factory() as session:
            user = User(email="report-author@test.com", password_hash="hash")
            report = Report(
                title="Broken sidewalk",
                description="",
                category="road",
                status="submitted",
                user=user,
                media_urls=[],
            )
            case = Case(
                report=report,
                title="Repair sidewalk",
                description="",
                assigned_to=user,
            )
            follow = CaseFollow(case=case, user=user)
            notification = Notification(
                user=user,
                type=NotificationType.status_change.value,
                payload={},
                read=False,
            )
            session.add_all([user, report, case, follow, notification])
            await session.flush()
            user_id, report_id, case_id = user.id, report.id, case.id

            await session.execute(delete(User).where(User.id == user_id))

            report_author = await session.scalar(
                select(Report.user_id).where(Report.id == report_id)
            )
            assignee = await session.scalar(select(Case.assigned_to_id).where(Case.id == case_id))
            remaining_follows = await session.scalar(
                select(func.count()).select_from(CaseFollow).where(CaseFollow.user_id == user_id)
            )
            remaining_notifications = await session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user_id)
            )

            assert report_author is None
            assert assignee is None
            assert remaining_follows == 0
            assert remaining_notifications == 0
    finally:
        await engine.dispose()
