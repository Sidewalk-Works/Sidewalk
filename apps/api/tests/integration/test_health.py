from collections.abc import AsyncGenerator

import pytest

from src.core.database import get_db


class _BrokenSession:
    async def execute(self, *args, **kwargs):
        raise RuntimeError("could not connect to server at db.internal.example:5432")


@pytest.fixture
def broken_db(app):
    async def override() -> AsyncGenerator[_BrokenSession, None]:
        yield _BrokenSession()

    app.dependency_overrides[get_db] = override


async def test_ready_is_ok_when_the_database_answers(client):
    res = await client.get("/api/health/ready")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


async def test_health_alias_matches_readiness(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


async def test_ready_returns_503_without_leaking_the_exception(client, broken_db):
    res = await client.get("/api/health/ready")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable"}
    assert "db.internal" not in res.text
    assert "environment" not in res.text


async def test_health_alias_also_reports_503(client, broken_db):
    res = await client.get("/api/health")
    assert res.status_code == 503


async def test_live_does_not_touch_the_database(client, broken_db):
    res = await client.get("/api/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
