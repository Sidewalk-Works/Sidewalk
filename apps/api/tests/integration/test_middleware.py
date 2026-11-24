from httpx import ASGITransport, AsyncClient
from structlog.testing import capture_logs

from src.core.config import get_settings
from src.main import create_app


async def test_cors_header_present_for_allowed_origin(client: AsyncClient):
    res = await client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


async def test_cors_header_absent_for_disallowed_origin(client: AsyncClient):
    res = await client.get("/api/health", headers={"Origin": "http://evil-attacker.com"})
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers


async def test_cors_preflight_for_allowed_origin(client: AsyncClient):
    res = await client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type,X-Request-ID",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "POST" in res.headers.get("access-control-allow-methods", "")
    assert "authorization" in res.headers.get("access-control-allow-headers", "").lower()


async def test_cors_preflight_absent_for_disallowed_origin(client: AsyncClient):
    res = await client.options(
        "/api/health",
        headers={
            "Origin": "http://evil-attacker.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in res.headers


async def test_security_headers_present_on_response(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert "x-xss-protection" not in res.headers
    assert res.headers.get("permissions-policy") == "camera=(), geolocation=(), microphone=()"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("content-security-policy") == "default-src 'self'"
    # HSTS should not be set in default development environment
    assert "strict-transport-security" not in res.headers


async def test_security_headers_hsts_present_in_production(monkeypatch):
    from src.core.database import get_db

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "a-secure-production-secret-key-with-at-least-32-chars")
    get_settings.cache_clear()
    try:
        prod_app = create_app()

        async def dummy_db():
            yield None

        prod_app.dependency_overrides[get_db] = dummy_db

        transport = ASGITransport(app=prod_app)
        async with AsyncClient(transport=transport, base_url="http://test") as prod_client:
            res = await prod_client.get("/api/health")
            assert (
                res.headers.get("strict-transport-security")
                == "max-age=63072000; includeSubDomains"
            )
    finally:
        get_settings.cache_clear()


async def test_x_request_id_present_on_response(client: AsyncClient):
    # Auto-generated request ID
    res1 = await client.get("/api/health")
    assert res1.status_code == 200
    assert "x-request-id" in res1.headers
    assert len(res1.headers["x-request-id"]) > 0

    # Custom passed request ID
    custom_id = "test-custom-request-id-12345"
    res2 = await client.get("/api/health", headers={"X-Request-ID": custom_id})
    assert res2.status_code == 200
    assert res2.headers.get("x-request-id") == custom_id


async def test_request_log_emits_structured_line(client: AsyncClient):
    with capture_logs() as captured_logs:
        res = await client.get("/api/health")
        assert res.status_code == 200
        # Order-independent structured log assertion using structlog.testing.capture_logs
        assert any(
            log.get("event") == "http_request"
            or log.get("path") == "/api/health"
            or "http_request" in str(log)
            for log in captured_logs
        )
