import uuid

from httpx import ASGITransport, AsyncClient


async def test_not_found_error_returns_404_with_message(client: AsyncClient):
    random_id = str(uuid.uuid4())
    response = await client.get(f"/api/reports/{random_id}")
    assert response.status_code == 404
    data = response.json()
    assert "message" in data
    assert data["message"] == "Report not found"


async def test_conflict_error_returns_409(client: AsyncClient):
    unique_email = f"conflict_{uuid.uuid4().hex[:6]}@example.com"
    payload = {"email": unique_email, "password": "password123"}
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 409
    data = second.json()
    assert "message" in data
    assert "already exists" in data["message"].lower() or "conflict" in data["message"].lower()
    assert data.get("field") == "email"


async def test_unauthorized_error_returns_401(client: AsyncClient):
    response = await client.get("/api/users/me")
    assert response.status_code == 401
    data = response.json()
    assert "message" in data


async def test_forbidden_error_returns_403(auth_client: AsyncClient):
    random_id = str(uuid.uuid4())
    response = await auth_client.patch(
        f"/api/moderation/reports/{random_id}/status",
        json={"status": "verified"},
    )
    assert response.status_code == 403
    data = response.json()
    assert "message" in data


async def test_validation_error_returns_422_with_errors_array(client: AsyncClient):
    response = await client.post("/api/auth/login", json={"email": "not-an-email"})
    assert response.status_code == 422
    data = response.json()
    assert "message" in data
    assert "errors" in data
    assert isinstance(data["errors"], list)
    assert len(data["errors"]) > 0
    assert "field" in data["errors"][0]
    assert "message" in data["errors"][0]


async def test_unhandled_exception_returns_500(app):
    @app.get("/api/test-unhandled-crash")
    async def crash():
        raise RuntimeError("Something went wrong internally")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        response = await test_client.get("/api/test-unhandled-crash")
        assert response.status_code == 500
        data = response.json()
        assert "message" in data
        assert data["message"] == "Internal server error"
