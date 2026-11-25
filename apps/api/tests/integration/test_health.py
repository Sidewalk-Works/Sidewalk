from collections.abc import AsyncGenerator

import pytest

from src.core.config import get_settings
from src.core.database import get_db


class _BrokenSession:
    def __init__(self) -> None:
        self.execute_calls: list[str] = []

    async def execute(self, statement, *args, **kwargs):
        self.execute_calls.append(str(statement))
        raise RuntimeError("could not connect to server at db.internal.example:5432")


@pytest.fixture
def broken_db(app):
    """Override ``get_db`` so health checks exercise the database-failure branch."""
    session = _BrokenSession()

    async def override() -> AsyncGenerator[_BrokenSession, None]:
        yield session

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    try:
        yield session
    finally:
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original


async def test_ready_is_ok_when_the_database_answers(client):
    res = await client.get("/api/health/ready")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": get_settings().API_VERSION}


async def test_health_alias_matches_readiness(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": get_settings().API_VERSION}


async def test_ready_returns_503_without_leaking_the_exception(client, broken_db):
    res = await client.get("/api/health/ready")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable"}
    assert "db.internal" not in res.text
    assert "environment" not in res.text
    assert broken_db.execute_calls == ["SELECT 1"]


async def test_health_alias_also_reports_503(client, broken_db):
    res = await client.get("/api/health")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable"}
    assert "db.internal" not in res.text
    assert "environment" not in res.text
    assert broken_db.execute_calls == ["SELECT 1"]


async def test_live_does_not_touch_the_database(client, broken_db):
    res = await client.get("/api/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert broken_db.execute_calls == []
