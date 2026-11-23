import pytest

from app.moderation.service import REPORT_STATUS_TRANSITIONS

import logging

def test_internal_server_error_is_logged(client, caplog):
    caplog.set_level(logging.ERROR)

    response = client.get("/test-error")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}

    assert any(
        record.levelno >= logging.ERROR
        for record in caplog.records
    )
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

    def test_malformed_json_error_identifies_body(client):
    response = client.post(
        "/reports",
        content="{invalid-json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422

    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert any(
        item.get("type") == "json_invalid"
        for item in detail
    )