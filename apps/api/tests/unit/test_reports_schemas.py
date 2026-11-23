import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError

from src.core.enums import REPORT_STATUS_TRANSITIONS, ReportCategory, ReportStatus
from src.modules.reports.schemas import CreateReportRequest, ReportResponse


def test_report_enums():
    assert ReportStatus.submitted.value == "submitted"
    assert ReportCategory.road.value == "road"
    assert ReportStatus.closed in REPORT_STATUS_TRANSITIONS[ReportStatus.submitted]
    assert len(REPORT_STATUS_TRANSITIONS[ReportStatus.closed]) == 0


def test_create_report_request_validation():
    req = CreateReportRequest(
        title="Pothole on Main St",
        description="Big hole in the road",
        category=ReportCategory.road,
        latitude=37.7749,
        longitude=-122.4194,
    )
    assert req.title == "Pothole on Main St"
    assert req.category == ReportCategory.road

    with pytest.raises(ValidationError):
        CreateReportRequest(title="ab", description="Too short title", category=ReportCategory.road)


def test_report_response_validation():
    now = datetime.now()
    rep = ReportResponse(
        id=uuid.uuid4(),
        title="Water leak",
        description="Burst pipe",
        category=ReportCategory.utility,
        status=ReportStatus.submitted,
        user_id=uuid.uuid4(),
        created_at=now,
        updated_at=now,
    )
    assert rep.status == ReportStatus.submitted
