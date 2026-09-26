import pytest
from httpx import AsyncClient


async def test_cors_header_present_for_allowed_origin(client: AsyncClient):
    res = await client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


async def test_cors_header_absent_for_disallowed_origin(client: AsyncClient):
    res = await client.get("/api/health", headers={"Origin": "http://evil-attacker.com"})
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers


async def test_security_headers_present_on_response(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-xss-protection") == "1; mode=block"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("content-security-policy") == "default-src 'self'"


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


async def test_request_log_emits_structured_line(client: AsyncClient, capsys):
    res = await client.get("/api/health")
    assert res.status_code == 200
    captured = capsys.readouterr()
    assert "http_request" in captured.out or "http_request" in captured.err
