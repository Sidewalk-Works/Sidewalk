from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import CaseFactory, NotificationFactory, ReportFactory, UserFactory


async def test_user_factory_create_async(db_session: AsyncSession):
    user = await UserFactory.create_async(db_session)
    assert user.id is not None
    assert user.email.startswith("user_")
    assert user.is_active is True
    assert user.is_admin is False


async def test_report_factory_create_async_with_generated_user(db_session: AsyncSession):
    report = await ReportFactory.create_async(db_session)
    assert report.id is not None
    assert report.user_id is not None
    assert report.status == "submitted"
    assert report.category == "road"


async def test_report_factory_create_async_with_existing_user(db_session: AsyncSession):
    user = await UserFactory.create_async(db_session)
    report = await ReportFactory.create_async(db_session, user=user)
    assert report.user_id == user.id


async def test_case_factory_create_async(db_session: AsyncSession):
    case = await CaseFactory.create_async(db_session)
    assert case.id is not None
    assert case.report_id is not None
    assert case.status == "opened"


async def test_notification_factory_create_async(db_session: AsyncSession):
    notification = await NotificationFactory.create_async(db_session)
    assert notification.id is not None
    assert notification.user_id is not None
    assert notification.read is False
