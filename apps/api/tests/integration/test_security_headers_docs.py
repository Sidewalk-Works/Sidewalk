from httpx import AsyncClient


async def test_docs_get_a_relaxed_csp_that_allows_the_cdn(client: AsyncClient):
    for path in ("/docs", "/redoc"):
        res = await client.get(path)
        assert res.status_code == 200
        csp = res.headers["content-security-policy"]
        assert "cdn.jsdelivr.net" in csp


async def test_api_responses_keep_the_strict_csp(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.headers["content-security-policy"] == "default-src 'self'"


async def test_x_xss_protection_is_not_sent(client: AsyncClient):
    for path in ("/docs", "/api/health"):
        res = await client.get(path)
        assert "x-xss-protection" not in res.headers
