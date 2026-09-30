import uuid

import pytest

from src.core.enums import CASE_STATUS_TRANSITIONS, CaseStatus
from src.core.exceptions import NotFoundError
from src.modules.auth.repository import create_user
from src.modules.cases import service as cases_service
from src.modules.cases.models import Case
from src.modules.reports.models import Report


def test_case_status_transitions():
    assert CaseStatus.opened.value == "opened"
    assert CaseStatus.closed in CASE_STATUS_TRANSITIONS[CaseStatus.opened]
    assert len(CASE_STATUS_TRANSITIONS[CaseStatus.closed]) == 0


async def test_follow_unfollow_case(db_session):
    user = await create_user(db_session, "case_fan@example.com", "hash")
    report = Report(
        title="Rep", description="Desc", category="road", user_id=user.id, media_urls=[]
    )
    db_session.add(report)
    await db_session.flush()

    case = Case(report_id=report.id, title="Case 1", description="Case desc")
    db_session.add(case)
    await db_session.commit()

    assert await cases_service.is_case_followed(db_session, case.id, user.id) is False

    await cases_service.follow_case(db_session, case.id, user.id)
    assert await cases_service.is_case_followed(db_session, case.id, user.id) is True

    # Duplicate follow is idempotent
    await cases_service.follow_case(db_session, case.id, user.id)
    assert await cases_service.is_case_followed(db_session, case.id, user.id) is True

    await cases_service.unfollow_case(db_session, case.id, user.id)
    assert await cases_service.is_case_followed(db_session, case.id, user.id) is False


async def test_follow_nonexistent_case_raises(db_session):
    user = await create_user(db_session, "fan2@example.com", "hash")
    with pytest.raises(NotFoundError):
        await cases_service.follow_case(db_session, uuid.uuid4(), user.id)
