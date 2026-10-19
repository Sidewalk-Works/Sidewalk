import uuid

from httpx import AsyncClient

PASSWORD = "testpassword123"


def _credentials(prefix: str = "user") -> dict[str, str]:
    return {"email": f"{prefix}_{uuid.uuid4().hex[:8]}@test.com", "password": PASSWORD}


async def test_register_returns_token_and_user(client: AsyncClient):
    creds = _credentials()

    res = await client.post("/api/auth/register", json=creds)

    assert res.status_code == 201
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == creds["email"]
    assert body["user"]["is_active"] is True
    assert body["user"]["is_admin"] is False
    assert "password" not in body["user"] and "password_hash" not in body["user"]


async def test_register_rejects_a_duplicate_email(client: AsyncClient):
    creds = _credentials()
    await client.post("/api/auth/register", json=creds)

    res = await client.post("/api/auth/register", json=creds)

    assert res.status_code == 409
    body = res.json()
    assert body["message"] == "A user with this email already exists"
    assert body["field"] == "email"


async def test_register_rejects_a_short_password(client: AsyncClient):
    res = await client.post(
        "/api/auth/register", json={**_credentials(), "password": "short"}
    )

    assert res.status_code == 422
    body = res.json()
    assert body["message"] == "Validation error"
    assert body["errors"][0]["field"] == "password"
    assert "at least 8" in body["errors"][0]["message"]


async def test_register_rejects_an_invalid_email(client: AsyncClient):
    res = await client.post(
        "/api/auth/register", json={"email": "not-an-email", "password": PASSWORD}
    )

    assert res.status_code == 422
    assert res.json()["errors"][0]["field"] == "email"


async def test_login_returns_a_token_that_authenticates_me(client: AsyncClient):
    creds = _credentials()
    await client.post("/api/auth/register", json=creds)

    login = await client.post("/api/auth/login", json=creds)

    assert login.status_code == 200
    body = login.json()
    assert set(body) >= {"access_token", "token_type", "user"}
    assert body["token_type"] == "bearer"

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == creds["email"]
    assert me.json()["id"] == body["user"]["id"]


async def test_login_rejects_a_wrong_password(client: AsyncClient):
    creds = _credentials()
    await client.post("/api/auth/register", json=creds)

    res = await client.post(
        "/api/auth/login", json={"email": creds["email"], "password": "wrong-password-1"}
    )

    assert res.status_code == 401
    assert res.json()["message"] == "Invalid credentials"


async def test_login_rejects_an_unknown_email(client: AsyncClient):
    res = await client.post("/api/auth/login", json=_credentials("ghost"))

    assert res.status_code == 401
    assert res.json()["message"] == "Invalid credentials"


async def test_login_rejects_an_inactive_account(client: AsyncClient, db_session):
    from sqlalchemy import select

    from src.modules.auth.models import User

    creds = _credentials()
    await client.post("/api/auth/register", json=creds)
    user = (await db_session.execute(select(User).where(User.email == creds["email"]))).scalar_one()
    user.is_active = False
    await db_session.commit()

    res = await client.post("/api/auth/login", json=creds)

    assert res.status_code == 401
    assert res.json()["message"] == "Account inactive"


async def test_me_requires_a_token(client: AsyncClient):
    res = await client.get("/api/auth/me")

    assert res.status_code in (401, 403)
    assert "message" in res.json()


async def test_me_rejects_a_malformed_token(client: AsyncClient):
    res = await client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})

    assert res.status_code == 401
    assert res.json()["message"] == "Invalid or expired token"
