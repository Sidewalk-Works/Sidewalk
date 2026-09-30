import uuid

from httpx import AsyncClient

from src.modules.cases.models import Case
from src.modules.reports.models import Report


async def register_and_login(
    client: AsyncClient,
    email: str = "caseuser@example.com",
    password: str = "password123",
) -> tuple[str, dict]:
    reg_res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201, reg_res.text
    login_res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    return token, user


async def create_test_case(
    db_session,
    user_id: uuid.UUID,
    title: str = "Test Case",
    status: str = "opened",
) -> Case:
    report = Report(
        title="Test Report",
        description="Test Desc",
        category="road",
        user_id=user_id,
        media_urls=[],
    )
    db_session.add(report)
    await db_session.flush()

    case = Case(
        report_id=report.id,
        title=title,
        description="Case Description",
        status=status,
    )
    db_session.add(case)
    await db_session.commit()
    await db_session.refresh(case)
    return case


async def test_list_cases_public(client: AsyncClient, db_session):
    _, user = await register_and_login(client, "public_cases@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Pothole Repair")

    res = await client.get("/api/cases")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    assert any(item["id"] == str(case.id) for item in data["items"])

    # Test status filtering
    filter_res = await client.get("/api/cases?status=open")
    assert filter_res.status_code == 200, filter_res.text
    filtered_data = filter_res.json()
    assert any(item["id"] == str(case.id) for item in filtered_data["items"])


async def test_follow_case_authenticated(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "follow_auth@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Traffic Light")

    res = await client.post(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 204


async def test_follow_case_idempotent(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "follow_idemp@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Water Pipeline")

    res1 = await client.post(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 204

    res2 = await client.post(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 204


async def test_unfollow_case_authenticated(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "unfollow_auth@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Park Bench")

    # Follow first
    res_follow = await client.post(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_follow.status_code == 204

    # Now unfollow
    res_unfollow = await client.delete(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_unfollow.status_code == 204


async def test_unfollow_case_idempotent(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "unfollow_idemp@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Street Sign")

    # Unfollow without following first
    res1 = await client.delete(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res1.status_code == 204

    # Unfollow again
    res2 = await client.delete(
        f"/api/cases/{case.id}/follow",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 204


async def test_follow_requires_auth(client: AsyncClient, db_session):
    _, user = await register_and_login(client, "owner_for_case@example.com")
    case = await create_test_case(db_session, uuid.UUID(user["id"]), title="Graffiti Cleanup")

    res = await client.post(f"/api/cases/{case.id}/follow")
    assert res.status_code == 401
