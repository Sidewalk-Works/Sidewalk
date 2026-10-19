import uuid

from fastapi import Request
from httpx import ASGITransport, AsyncClient
from structlog.testing import capture_logs

from src.core import exceptions
from src.core.limiter import limiter


async def test_not_found_has_a_code(client: AsyncClient):
    res = await client.get(f"/api/reports/{uuid.uuid4()}")
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"


async def test_duplicate_email_has_a_specific_code(client: AsyncClient):
    payload = {"email": f"dup_{uuid.uuid4().hex[:6]}@example.com", "password": "password123"}
    await client.post("/api/auth/register", json=payload)

    res = await client.post("/api/auth/register", json=payload)

    assert res.status_code == 409
    assert res.json()["code"] == "email_taken"
    assert res.json()["field"] == "email"


async def test_bad_credentials_have_a_specific_code(client: AsyncClient):
    res = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "password123"}
    )
    assert res.status_code == 401
    assert res.json()["code"] == "invalid_credentials"


async def test_validation_errors_have_a_code(client: AsyncClient):
    res = await client.post("/api/auth/login", json={"email": "not-an-email"})
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


async def test_framework_http_errors_get_a_code(client: AsyncClient):
    res = await client.get("/api/users/me")
    assert res.status_code == 401
    assert res.json()["code"] == "unauthorized"


def test_every_app_error_subclass_defines_its_own_code():
    classes = [
        cls
        for cls in vars(exceptions).values()
        if isinstance(cls, type) and issubclass(cls, exceptions.AppError) and cls is not exceptions.AppError
    ]
    assert classes
    for cls in classes:
        assert "code" in vars(cls) or cls.code != exceptions.AppError.code, cls.__name__


async def test_unhandled_exception_is_logged_with_traceback_and_request_id(app):
    @app.get("/api/test-boom")
    async def boom():
        raise RuntimeError("secret internal detail")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        with capture_logs() as captured:
            res = await test_client.get("/api/test-boom", headers={"X-Request-ID": "boom-1"})

    assert res.status_code == 500
    assert res.json() == {"code": "internal_error", "message": "Internal server error"}
    assert "secret internal detail" not in res.text
    (entry,) = [e for e in captured if e["event"] == "unhandled_exception"]
    assert entry["log_level"] == "error"
    assert entry["path"] == "/api/test-boom"
    assert entry["request_id"] == "boom-1"
    assert isinstance(entry["exc_info"], RuntimeError)


async def test_rate_limit_response_uses_the_api_error_shape(app, client: AsyncClient):
    @app.get("/api/test-limited")
    @limiter.limit("1/minute")
    async def limited(request: Request) -> dict[str, bool]:
        return {"ok": True}

    first = await client.get("/api/test-limited")
    second = await client.get("/api/test-limited")

    assert first.status_code == 200
    assert second.status_code == 429
    body = second.json()
    assert body["code"] == "rate_limited"
    assert "message" in body and "error" not in body
    assert int(second.headers["retry-after"]) > 0


async def test_429_is_declared_in_the_openapi_schema(client: AsyncClient):
    schema = (await client.get("/openapi.json")).json()
    operation = schema["paths"]["/api/auth/login"]["post"]
    assert "429" in operation["responses"]
