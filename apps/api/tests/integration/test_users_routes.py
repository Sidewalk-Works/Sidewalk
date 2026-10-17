from httpx import AsyncClient


async def register_and_login(
    client: AsyncClient, email: str = "test@example.com", password: str = "testpassword123"
) -> tuple[str, dict]:
    reg_res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201, reg_res.text
    login_res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    return token, user


async def test_get_profile_authenticated(client: AsyncClient):
    token, user = await register_and_login(client, "alice@example.com")
    response = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert data["id"] == user["id"]
    assert "password_hash" not in data


async def test_get_profile_unauthenticated_returns_401(client: AsyncClient):
    response = await client.get("/api/users/me")
    assert response.status_code == 401


async def test_update_email_success(client: AsyncClient):
    token, user = await register_and_login(client, "update_test@example.com")
    res = await client.patch(
        "/api/users/me",
        json={"email": "updated@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "updated@example.com"
    assert data["id"] == user["id"]


async def test_update_email_duplicate_conflict(client: AsyncClient):
    await client.post(
        "/api/auth/register", json={"email": "existing@example.com", "password": "testpassword123"}
    )
    token, _ = await register_and_login(client, "updater@example.com")
    res = await client.patch(
        "/api/users/me",
        json={"email": "existing@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 409
    assert res.json().get("field") == "email"


async def test_update_empty_payload_returns_422(client: AsyncClient):
    token, _ = await register_and_login(client, "empty_payload@example.com")
    res = await client.patch(
        "/api/users/me",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


async def test_update_unauthenticated_returns_401(client: AsyncClient):
    res = await client.patch("/api/users/me", json={"email": "fail@example.com"})
    assert res.status_code == 401
