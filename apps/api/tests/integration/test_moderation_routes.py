import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from src.modules.auth.models import User
from src.modules.reports.models import Report


async def register_and_login(
    client: AsyncClient,
    email: str = "moduser@example.com",
    password: str = "password123",
) -> tuple[str, dict]:
    reg_res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201, reg_res.text
    login_res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    return token, user


async def make_user_admin(db_session, user_id: uuid.UUID) -> None:
    stmt = select(User).where(User.id == user_id)
    res = await db_session.execute(stmt)
    u = res.scalar_one()
    u.is_admin = True
    await db_session.commit()


async def create_test_report(db_session, user_id: uuid.UUID, status: str = "submitted") -> Report:
    report = Report(
        title="Pothole on Main",
        description="Deep pothole near crosswalk",
        category="road",
        status=status,
        user_id=user_id,
        media_urls=[],
    )
    db_session.add(report)
    await db_session.commit()
    await db_session.refresh(report)
    return report


async def test_flag_report_as_admin(client: AsyncClient, db_session):
    admin_token, admin_user = await register_and_login(client, "admin1@example.com")
    await make_user_admin(db_session, uuid.UUID(admin_user["id"]))
    report = await create_test_report(db_session, uuid.UUID(admin_user["id"]))

    res = await client.post(
        f"/api/moderation/reports/{report.id}/flag",
        json={"reason": "Inappropriate content"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["flagged"] is True
    assert data["flag_reason"] == "Inappropriate content"


async def test_flag_report_as_non_admin_returns_403(client: AsyncClient, db_session):
    user_token, user = await register_and_login(client, "nonadmin1@example.com")
    report = await create_test_report(db_session, uuid.UUID(user["id"]))

    res = await client.post(
        f"/api/moderation/reports/{report.id}/flag",
        json={"reason": "Spam"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert res.status_code == 403


async def test_flag_nonexistent_report_returns_404(client: AsyncClient, db_session):
    admin_token, admin_user = await register_and_login(client, "admin2@example.com")
    await make_user_admin(db_session, uuid.UUID(admin_user["id"]))

    fake_id = uuid.uuid4()
    res = await client.post(
        f"/api/moderation/reports/{fake_id}/flag",
        json={"reason": "Testing 404"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 404


async def test_update_report_status_as_admin(client: AsyncClient, db_session):
    admin_token, admin_user = await register_and_login(client, "admin3@example.com")
    await make_user_admin(db_session, uuid.UUID(admin_user["id"]))
    report = await create_test_report(db_session, uuid.UUID(admin_user["id"]), status="submitted")

    res = await client.patch(
        f"/api/moderation/reports/{report.id}/status",
        json={"status": "under_review", "notes": "Moving to review"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "under_review"


async def test_invalid_status_transition_returns_422(client: AsyncClient, db_session):
    admin_token, admin_user = await register_and_login(client, "admin4@example.com")
    await make_user_admin(db_session, uuid.UUID(admin_user["id"]))
    report = await create_test_report(db_session, uuid.UUID(admin_user["id"]), status="submitted")

    # submitted -> resolved is invalid (valid: under_review, closed)
    res = await client.patch(
        f"/api/moderation/reports/{report.id}/status",
        json={"status": "resolved", "notes": "Trying jump to resolved"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 422


async def test_update_status_as_non_admin_returns_403(client: AsyncClient, db_session):
    user_token, user = await register_and_login(client, "nonadmin2@example.com")
    report = await create_test_report(db_session, uuid.UUID(user["id"]))

    res = await client.patch(
        f"/api/moderation/reports/{report.id}/status",
        json={"status": "under_review"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert res.status_code == 403
