import re

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.enums import NotificationType, ReportCategory, ReportStatus
from tests.factories import (
    CaseFactory,
    NotificationFactory,
    ReportFactory,
    UserFactory,
    seed_factories,
)


def test_same_seed_gives_same_data():
    # Verify that resetting/seeding Faker gives identical data
    seed_factories(9999)
    desc1 = ReportFactory.build().description

    seed_factories(9999)
    desc2 = ReportFactory.build().description

    assert desc1 == desc2


async def test_user_factory_create_async_and_schema_validity(db_session: AsyncSession):
    user = await UserFactory.create_async(db_session)
    assert user.id is not None
    # No random hex suffix: matches user_<int>@example.com
    assert re.match(r"^user_\d+@example\.com$", user.email)
    assert user.is_active is True
    assert user.is_admin is False
    assert isinstance(user.password_hash, str)
    assert len(user.password_hash) > 0


async def test_report_factory_create_async_with_generated_user(db_session: AsyncSession):
    report = await ReportFactory.create_async(db_session)
    assert report.id is not None
    assert report.user_id is not None
    # Schema enum checks
    assert report.status in [s.value for s in ReportStatus]
    assert report.category in [c.value for c in ReportCategory]
    assert isinstance(report.description, str)
    assert len(report.description) > 0
    assert isinstance(report.latitude, float)
    assert isinstance(report.longitude, float)


async def test_report_factory_create_async_with_existing_user(db_session: AsyncSession):
    user = await UserFactory.create_async(db_session)
    report = await ReportFactory.create_async(db_session, user=user)
    assert report.user_id == user.id
    assert report.category == ReportCategory.road.value
    assert report.status == ReportStatus.submitted.value


async def test_case_factory_create_async_and_schema_validity(db_session: AsyncSession):
    case = await CaseFactory.create_async(db_session)
    assert case.id is not None
    assert case.report_id is not None
    assert case.status in ["open", "closed", "in_progress"]
    assert isinstance(case.title, str)
    assert isinstance(case.description, str)


async def test_notification_factory_create_async_and_schema_validity(db_session: AsyncSession):
    notification = await NotificationFactory.create_async(db_session)
    assert notification.id is not None
    assert notification.user_id is not None
    assert notification.read is False
    # Validate notification type against schema enum
    assert isinstance(notification.type, NotificationType)
    assert notification.type == NotificationType.status_change
    assert isinstance(notification.payload, dict)
    assert "message" in notification.payload
