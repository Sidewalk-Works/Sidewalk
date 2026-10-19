import uuid

import pytest
from httpx import AsyncClient


def _body(password: str) -> dict[str, str]:
    return {"email": f"pw_{uuid.uuid4().hex[:8]}@test.com", "password": password}


@pytest.mark.parametrize(
    "password",
    [
        "a" * 72,  # 72 ASCII bytes
        "é" * 36,  # 72 bytes in 36 characters
        "€" * 24,  # 72 bytes in 24 characters
    ],
)
async def test_passwords_at_the_byte_limit_are_accepted(client: AsyncClient, password: str):
    body = _body(password)
    assert (await client.post("/api/auth/register", json=body)).status_code == 201
    assert (await client.post("/api/auth/login", json=body)).status_code == 200


@pytest.mark.parametrize(
    "password",
    [
        "a" * 73,
        "é" * 37,  # 74 bytes, only 37 characters
        "€" * 25,  # 75 bytes, only 25 characters
    ],
)
async def test_passwords_over_the_byte_limit_return_422_not_500(client: AsyncClient, password: str):
    res = await client.post("/api/auth/register", json=_body(password))

    assert res.status_code == 422
    errors = res.json()["errors"]
    assert errors[0]["field"] == "password"
    assert "72 bytes" in errors[0]["message"]


async def test_login_with_an_over_long_password_is_a_clean_422(client: AsyncClient):
    res = await client.post("/api/auth/login", json=_body("a" * 100))

    assert res.status_code == 422
    assert res.json()["errors"][0]["field"] == "password"
