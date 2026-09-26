import uuid
import pytest
from httpx import AsyncClient
from src.core.enums import NotificationType
from src.modules.notifications import service as notif_service


async def register_and_login(
    client: AsyncClient,
    email: str = "notifroute@example.com",
    password: str = "password123",
) -> tuple[str, dict]:
    reg_res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201, reg_res.text
    login_res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    return token, user


async def test_list_notifications_authenticated(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "notif_auth1@example.com")
    user_id = uuid.UUID(user["id"])
    await notif_service.create_notification(db_session, user_id, NotificationType.mention)
    await notif_service.create_notification(db_session, user_id, NotificationType.report_update)

    res = await client.get("/api/notifications", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert "items" in data
    assert data["total"] == 2
    assert len(data["items"]) == 2


async def test_list_notifications_unread_filter(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "notif_auth2@example.com")
    user_id = uuid.UUID(user["id"])
    n1 = await notif_service.create_notification(db_session, user_id, NotificationType.mention)
    n2 = await notif_service.create_notification(db_session, user_id, NotificationType.report_update)
    await notif_service.mark_read(db_session, n1.id, user_id)

    res = await client.get(
        "/api/notifications?unread_only=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == str(n2.id)


async def test_list_notifications_unauthenticated_401(client: AsyncClient):
    res = await client.get("/api/notifications")
    assert res.status_code == 401


async def test_mark_notification_read(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "notif_auth3@example.com")
    user_id = uuid.UUID(user["id"])
    n = await notif_service.create_notification(db_session, user_id, NotificationType.status_change)

    res = await client.patch(
        f"/api/notifications/{n.id}/read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["read"] is True


async def test_mark_other_users_notification_403(client: AsyncClient, db_session):
    token1, user1 = await register_and_login(client, "notif_u1@example.com")
    token2, user2 = await register_and_login(client, "notif_u2@example.com")
    n = await notif_service.create_notification(db_session, uuid.UUID(user1["id"]), NotificationType.mention)

    res = await client.patch(
        f"/api/notifications/{n.id}/read",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res.status_code == 403


async def test_mark_all_read(client: AsyncClient, db_session):
    token, user = await register_and_login(client, "notif_auth4@example.com")
    user_id = uuid.UUID(user["id"])
    await notif_service.create_notification(db_session, user_id, NotificationType.mention)
    await notif_service.create_notification(db_session, user_id, NotificationType.status_change)

    res = await client.patch(
        "/api/notifications/read-all",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["marked_read"] == 2
