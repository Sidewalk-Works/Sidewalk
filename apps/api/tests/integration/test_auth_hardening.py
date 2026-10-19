import uuid

from httpx import AsyncClient
from sqlalchemy import select
from structlog.testing import capture_logs

from src.core import security
from src.modules.auth.models import User

PASSWORD = "testpassword123"


def _email(prefix: str = "Mixed") -> str:
    return f"{prefix}.Case_{uuid.uuid4().hex[:6]}@Example.COM"


# --- email normalization (1154) ----------------------------------------------------------


async def test_emails_differing_only_by_case_are_the_same_account(client: AsyncClient):
    email = _email()
    first = await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert first.status_code == 201

    dup = await client.post(
        "/api/auth/register", json={"email": email.lower(), "password": PASSWORD}
    )
    assert dup.status_code == 409
    assert dup.json()["field"] == "email"


async def test_registered_email_is_stored_lower_cased(client: AsyncClient, db_session):
    email = _email()
    res = await client.post("/api/auth/register", json={"email": f"  {email}  ", "password": PASSWORD})
    assert res.status_code == 201
    assert res.json()["user"]["email"] == email.lower()

    stored = (await db_session.execute(select(User.email).where(User.email == email.lower()))).scalar_one()
    assert stored == email.lower()


async def test_login_ignores_email_case(client: AsyncClient):
    email = _email()
    await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})

    res = await client.post("/api/auth/login", json={"email": email.upper(), "password": PASSWORD})

    assert res.status_code == 200
    assert res.json()["user"]["email"] == email.lower()


async def test_accounts_stored_before_normalization_can_still_log_in(client: AsyncClient, db_session):
    from tests.factories import UserFactory

    legacy = f"Legacy_{uuid.uuid4().hex[:6]}@Example.com"
    user = UserFactory.build(email=legacy, password_hash=security.hash_password(PASSWORD))
    db_session.add(user)
    await db_session.commit()

    res = await client.post("/api/auth/login", json={"email": legacy.lower(), "password": PASSWORD})

    assert res.status_code == 200
    assert res.json()["user"]["id"] == str(user.id)


async def test_profile_email_change_is_normalized(client: AsyncClient):
    email = _email("owner")
    body = (await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})).json()
    other = _email("other")
    await client.post("/api/auth/register", json={"email": other, "password": PASSWORD})

    res = await client.patch(
        "/api/users/me",
        json={"email": other.upper()},
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )

    assert res.status_code == 409


# --- login does not reveal registered emails (1155) --------------------------------------


async def test_unknown_email_and_wrong_password_are_indistinguishable(client: AsyncClient):
    email = _email("known")
    await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})

    unknown = await client.post(
        "/api/auth/login", json={"email": _email("ghost"), "password": PASSWORD}
    )
    wrong = await client.post(
        "/api/auth/login", json={"email": email, "password": "not-the-password"}
    )

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


async def test_unknown_email_still_pays_for_a_password_check(client: AsyncClient, monkeypatch):
    calls: list[str] = []
    real = security.verify_password

    def spy(plain: str, hashed: str) -> bool:
        calls.append(plain)
        return real(plain, hashed)

    monkeypatch.setattr(security, "verify_password", spy)

    res = await client.post(
        "/api/auth/login", json={"email": _email("ghost"), "password": "some-password-1"}
    )

    assert res.status_code == 401
    assert calls == ["some-password-1"]


# --- register rate limit (1156) ----------------------------------------------------------


async def test_register_is_rate_limited_separately(client: AsyncClient):
    statuses = []
    for i in range(12):
        res = await client.post(
            "/api/auth/register",
            json={"email": f"burst{i}_{uuid.uuid4().hex[:6]}@example.com", "password": PASSWORD},
        )
        statuses.append(res.status_code)

    assert statuses[:10] == [201] * 10
    assert 429 in statuses[10:]


# --- no email addresses in logs (1157) ---------------------------------------------------


async def test_registering_does_not_log_the_email_address(client: AsyncClient):
    email = f"private_{uuid.uuid4().hex[:6]}@example.com"

    with capture_logs() as captured:
        res = await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})

    assert res.status_code == 201
    assert any(entry["event"] == "register_user" for entry in captured)
    assert email not in repr(captured)
