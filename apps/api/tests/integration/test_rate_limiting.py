from httpx import AsyncClient

from src.core.config import get_settings
from src.core.schemas import ApiError


async def test_login_rate_limiting(client: AsyncClient):
    settings = get_settings()
    # Dynamically read configured limit (e.g. "10/minute" -> 10)
    limit = int(settings.RATE_LIMIT_LOGIN.split("/")[0])
    payload = {"email": "ratelimit@example.com", "password": "wrongpassword"}

    # First `limit` requests with invalid credentials must return 401 Unauthorized
    for _ in range(limit):
        res = await client.post("/api/auth/login", json=payload)
        assert res.status_code == 401

    # The (limit + 1)-th request must be rate-limited with 429
    rate_limited_res = await client.post("/api/auth/login", json=payload)
    assert rate_limited_res.status_code == 429

    # Verify Retry-After header
    assert "retry-after" in rate_limited_res.headers or "Retry-After" in rate_limited_res.headers

    # Verify response body matches standard ApiError schema and does not use slowapi's default {'error': ...}
    body = rate_limited_res.json()
    assert "error" not in body
    assert body["code"] == "rate_limited"
    assert "message" in body

    # Validate against standard ApiError model
    api_error = ApiError.model_validate(body)
    assert api_error.code == "rate_limited"
    assert isinstance(api_error.message, str)
