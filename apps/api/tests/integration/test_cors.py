from httpx import AsyncClient

PREFLIGHT = {
    "Origin": "http://localhost:3000",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
}


async def test_preflight_succeeds_for_configured_origin_method_and_headers(client: AsyncClient):
    res = await client.options("/api/reports", headers=PREFLIGHT)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in res.headers["access-control-allow-methods"]
    assert "access-control-allow-credentials" not in res.headers


async def test_preflight_fails_for_unknown_origin(client: AsyncClient):
    res = await client.options("/api/reports", headers={**PREFLIGHT, "Origin": "http://evil.example"})
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


async def test_preflight_fails_for_unlisted_method(client: AsyncClient):
    res = await client.options(
        "/api/reports", headers={**PREFLIGHT, "Access-Control-Request-Method": "TRACE"}
    )
    assert res.status_code == 400


async def test_preflight_fails_for_unlisted_header(client: AsyncClient):
    res = await client.options(
        "/api/reports", headers={**PREFLIGHT, "Access-Control-Request-Headers": "x-custom-thing"}
    )
    assert res.status_code == 400
