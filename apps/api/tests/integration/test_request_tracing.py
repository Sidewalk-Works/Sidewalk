import structlog
from httpx import AsyncClient
from structlog.testing import capture_logs


def _access_logs(captured: list[dict]) -> list[dict]:
    return [entry for entry in captured if entry["event"] == "http_request"]


async def test_valid_request_id_is_echoed(client: AsyncClient):
    res = await client.get("/api/health/live", headers={"X-Request-ID": "abc-123"})
    assert res.headers["x-request-id"] == "abc-123"


async def test_malformed_request_id_is_replaced(client: AsyncClient):
    for bad in ["x" * 65, "has space", "inject\nline", "semi;colon", "ünïcode"]:
        try:
            res = await client.get("/api/health/live", headers={"X-Request-ID": bad})
        except Exception:  # some values cannot even be sent as HTTP headers
            continue
        assert res.headers["x-request-id"] != bad
        assert len(res.headers["x-request-id"]) <= 64


async def test_context_from_a_previous_request_is_cleared(client: AsyncClient):
    structlog.contextvars.bind_contextvars(user_id="stale-user", request_id="stale-request")

    res = await client.get("/api/health/live", headers={"X-Request-ID": "fresh-id"})

    assert res.status_code == 200
    context = structlog.contextvars.get_contextvars()
    assert "user_id" not in context
    assert context["request_id"] == "fresh-id"


async def test_access_log_contains_request_id(client: AsyncClient):
    with capture_logs() as captured:
        await client.get("/api/health/live", headers={"X-Request-ID": "trace-me"})

    (entry,) = _access_logs(captured)
    assert entry["request_id"] == "trace-me"
    assert entry["status_code"] == 200
    assert "user_id" not in entry


async def test_access_log_contains_user_id_when_authenticated(auth_client: AsyncClient):
    me = (await auth_client.get("/api/auth/me")).json()

    with capture_logs() as captured:
        res = await auth_client.get("/api/auth/me", headers={"X-Request-ID": "authed-req"})

    assert res.status_code == 200
    (entry,) = _access_logs(captured)
    assert entry["request_id"] == "authed-req"
    assert entry["user_id"] == me["id"]
