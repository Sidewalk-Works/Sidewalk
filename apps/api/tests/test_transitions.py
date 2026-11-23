import pytest

from app.moderation.service import REPORT_STATUS_TRANSITIONS


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [
        (current, next_status)
        for current, allowed_statuses in REPORT_STATUS_TRANSITIONS.items()
        for next_status in allowed_statuses
    ],
)
def test_allowed_report_transitions(
    current_status,
    next_status,
):
    # Arrange: create report in current_status
    report = create_report(status=current_status)

    # Act
    response = client.patch(
        f"/reports/{report.id}/status",
        json={"status": next_status},
    )

    # Assert
    assert response.status_code == 200
    assert get_report(report.id).status == next_status