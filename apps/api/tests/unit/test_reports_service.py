import pytest

from src.core.enums import ReportCategory
from src.core.exceptions import ForbiddenError
from src.modules.auth.repository import create_user
from src.modules.reports import service as report_service
from src.modules.reports.schemas import CreateReportRequest, UpdateReportRequest


async def test_create_report_service(db_session):
    user = await create_user(db_session, "rep_serv1@example.com", "hash")
    payload = CreateReportRequest(
        title="Test report",
        description="Test desc",
        category=ReportCategory.road,
        media_urls=["https://example.com/a.png"],
    )
    res = await report_service.create_report(db_session, user.id, payload)
    assert res.title == "Test report"
    assert res.user_id == user.id
    assert res.category == ReportCategory.road


async def test_update_report_owner_only_forbidden(db_session):
    owner = await create_user(db_session, "rep_owner@example.com", "hash")
    stranger = await create_user(db_session, "rep_stranger@example.com", "hash")
    payload = CreateReportRequest(
        title="Owner Report", description="Desc", category=ReportCategory.road
    )
    rep = await report_service.create_report(db_session, owner.id, payload)

    update_payload = UpdateReportRequest(title="Hacked Title")
    with pytest.raises(ForbiddenError):
        await report_service.update_report(db_session, rep.id, stranger, update_payload)


async def test_delete_report_owner_only_forbidden(db_session):
    owner = await create_user(db_session, "rep_owner2@example.com", "hash")
    stranger = await create_user(db_session, "rep_stranger2@example.com", "hash")
    payload = CreateReportRequest(
        title="Owner Report 2", description="Desc", category=ReportCategory.road
    )
    rep = await report_service.create_report(db_session, owner.id, payload)

    with pytest.raises(ForbiddenError):
        await report_service.delete_report(db_session, rep.id, stranger)


async def test_list_reports_filtering(db_session):
    user = await create_user(db_session, "filter_user@example.com", "hash")
    p1 = CreateReportRequest(title="Road Rep", description="Desc", category=ReportCategory.road)
    p2 = CreateReportRequest(title="Waste Rep", description="Desc", category=ReportCategory.waste)
    await report_service.create_report(db_session, user.id, p1)
    await report_service.create_report(db_session, user.id, p2)

    roads = await report_service.list_reports(db_session, category=ReportCategory.road)
    assert all(r.category == ReportCategory.road for r in roads)
