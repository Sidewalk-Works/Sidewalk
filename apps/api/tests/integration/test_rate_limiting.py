from httpx import AsyncClient


async def test_login_rate_limiting(client: AsyncClient):
    payload = {"email": "ratelimit@example.com", "password": "wrongpassword"}

    statuses = []
    for _ in range(11):
        res = await client.post("/api/auth/login", json=payload)
        statuses.append(res.status_code)

    # First 10 requests should be 401 Unauthorized (since wrong password), 11th should be 429
    assert statuses[-1] == 429
