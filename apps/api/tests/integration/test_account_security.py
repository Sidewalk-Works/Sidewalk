import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from src.core.config import get_settings
from src.core.mail import MemoryMailBackend
from src.core.security import create_access_token, hash_token
from src.modules.auth.models import AuthToken, User

PASSWORD = "testpassword123"


@pytest.fixture
def mailbox(monkeypatch) -> MemoryMailBackend:
    backend = MemoryMailBackend()
    monkeypatch.setattr("src.modules.auth.service.get_mail_backend", lambda: backend)
    return backend


def _creds() -> dict[str, str]:
    return {"email": f"sec_{uuid.uuid4().hex[:8]}@test.com", "password": PASSWORD}


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token_from(message) -> str:
    return re.search(r"token=([\w-]+)", message.body).group(1)


async def _register(client: AsyncClient) -> tuple[dict, dict[str, str]]:
    creds = _creds()
    res = await client.post("/api/auth/register", json=creds)
    assert res.status_code == 201, res.text
    return res.json(), creds


# --- token errors (1159) -----------------------------------------------------------------


async def test_expired_and_invalid_tokens_have_different_codes(client: AsyncClient):
    body, _ = await _register(client)
    user_id = body["user"]["id"]

    expired = create_access_token({"sub": user_id, "tv": 0}, expires_minutes=-1)
    res = await client.get("/api/auth/me", headers=_bearer(expired))
    assert res.status_code == 401
    assert res.json()["code"] == "token_expired"
    assert res.headers["www-authenticate"] == "Bearer"

    forged = jwt.encode({"sub": user_id, "tv": 0}, "wrong-secret-wrong-secret-wrong-secret", "HS256")
    res = await client.get("/api/auth/me", headers=_bearer(forged))
    assert res.status_code == 401
    assert res.json()["code"] == "token_invalid"
    assert "wrong-secret" not in res.text and "Signature" not in res.text


async def test_missing_token_is_401_with_www_authenticate(client: AsyncClient):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


# --- refresh and logout (1158) -----------------------------------------------------------


async def test_register_and_login_return_a_refresh_token(client: AsyncClient):
    body, creds = await _register(client)
    assert body["refresh_token"]
    login = await client.post("/api/auth/login", json=creds)
    assert login.json()["refresh_token"] != body["refresh_token"]


async def test_refresh_rotates_the_token(client: AsyncClient):
    body, _ = await _register(client)

    res = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})

    assert res.status_code == 200
    new = res.json()
    assert new["refresh_token"] != body["refresh_token"]
    me = await client.get("/api/auth/me", headers=_bearer(new["access_token"]))
    assert me.status_code == 200


async def test_reusing_a_rotated_refresh_token_revokes_the_session(client: AsyncClient):
    body, _ = await _register(client)
    rotated = (
        await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    ).json()

    replay = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert replay.status_code == 401

    # The leak response: everything issued so far is dead, including the rotated pair.
    assert (
        await client.get("/api/auth/me", headers=_bearer(rotated["access_token"]))
    ).status_code == 401
    again = await client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert again.status_code == 401


async def test_unknown_refresh_token_is_rejected(client: AsyncClient):
    res = await client.post("/api/auth/refresh", json={"refresh_token": "nope"})
    assert res.status_code == 401
    assert res.json()["code"] == "token_invalid"


async def test_expired_refresh_token_is_rejected(client: AsyncClient, db_session):
    body, _ = await _register(client)
    row = (
        await db_session.execute(
            select(AuthToken).where(AuthToken.token_hash == hash_token(body["refresh_token"]))
        )
    ).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    res = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert res.status_code == 401


async def test_logout_revokes_access_and_refresh_tokens(client: AsyncClient):
    body, _ = await _register(client)

    out = await client.post("/api/auth/logout", headers=_bearer(body["access_token"]))
    assert out.status_code == 204

    assert (
        await client.get("/api/auth/me", headers=_bearer(body["access_token"]))
    ).status_code == 401
    refresh = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 401


async def test_access_tokens_are_short_lived(client: AsyncClient):
    body, _ = await _register(client)
    claims = jwt.decode(body["access_token"], options={"verify_signature": False})
    lifetime = claims["exp"] - datetime.now(UTC).timestamp()
    assert 0 < lifetime <= get_settings().JWT_EXPIRES_MINUTES * 60 + 5
    assert claims["jti"]


# --- password change (1160) --------------------------------------------------------------


async def test_password_change_requires_the_current_password(client: AsyncClient):
    body, _ = await _register(client)
    res = await client.post(
        "/api/users/me/password",
        json={"current_password": "wrong-password", "new_password": "brand-new-password"},
        headers=_bearer(body["access_token"]),
    )
    assert res.status_code == 401


async def test_password_change_revokes_older_sessions_and_returns_fresh_tokens(client: AsyncClient):
    body, creds = await _register(client)
    other_session = (await client.post("/api/auth/login", json=creds)).json()

    res = await client.post(
        "/api/users/me/password",
        json={"current_password": PASSWORD, "new_password": "brand-new-password"},
        headers=_bearer(body["access_token"]),
    )

    assert res.status_code == 200
    fresh = res.json()
    for stale in (body["access_token"], other_session["access_token"]):
        assert (await client.get("/api/auth/me", headers=_bearer(stale))).status_code == 401
    assert (
        await client.post("/api/auth/refresh", json={"refresh_token": other_session["refresh_token"]})
    ).status_code == 401
    assert (await client.get("/api/auth/me", headers=_bearer(fresh["access_token"]))).status_code == 200
    login = await client.post(
        "/api/auth/login", json={"email": creds["email"], "password": "brand-new-password"}
    )
    assert login.status_code == 200


# --- password reset (1160) ---------------------------------------------------------------


async def test_forgot_password_answers_the_same_for_unknown_accounts(client: AsyncClient, mailbox):
    known, creds = await _register(client)
    mailbox.outbox.clear()

    a = await client.post("/api/auth/forgot-password", json={"email": creds["email"]})
    b = await client.post("/api/auth/forgot-password", json={"email": "nobody@test.com"})

    assert a.status_code == b.status_code == 202
    assert a.json() == b.json()
    assert len(mailbox.outbox) == 1
    assert known["user"]["email"] == mailbox.outbox[0].to


async def test_reset_token_works_once_and_is_hashed_at_rest(client: AsyncClient, mailbox, db_session):
    _, creds = await _register(client)
    mailbox.outbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": creds["email"]})
    raw = _token_from(mailbox.outbox[0])

    stored = (await db_session.execute(select(AuthToken).where(AuthToken.kind == "password_reset"))).scalars().all()
    assert all(raw not in row.token_hash for row in stored)
    assert any(row.token_hash == hash_token(raw) for row in stored)

    ok = await client.post(
        "/api/auth/reset-password", json={"token": raw, "new_password": "reset-password-1"}
    )
    assert ok.status_code == 200
    assert (
        await client.post("/api/auth/login", json={"email": creds["email"], "password": "reset-password-1"})
    ).status_code == 200

    reuse = await client.post(
        "/api/auth/reset-password", json={"token": raw, "new_password": "reset-password-2"}
    )
    assert reuse.status_code == 401


async def test_expired_or_bogus_reset_tokens_are_rejected(client: AsyncClient, mailbox, db_session):
    _, creds = await _register(client)
    mailbox.outbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": creds["email"]})
    raw = _token_from(mailbox.outbox[0])
    row = (await db_session.execute(select(AuthToken).where(AuthToken.token_hash == hash_token(raw)))).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    expired = await client.post(
        "/api/auth/reset-password", json={"token": raw, "new_password": "reset-password-1"}
    )
    bogus = await client.post(
        "/api/auth/reset-password", json={"token": "bogus", "new_password": "reset-password-1"}
    )
    assert expired.status_code == bogus.status_code == 401


async def test_a_verification_token_cannot_reset_a_password(client: AsyncClient, mailbox):
    await _register(client)
    raw = _token_from(mailbox.outbox[-1])
    res = await client.post(
        "/api/auth/reset-password", json={"token": raw, "new_password": "reset-password-1"}
    )
    assert res.status_code == 401


# --- email verification (1160) -----------------------------------------------------------


async def test_registration_sends_a_verification_email_that_verifies_once(client: AsyncClient, mailbox):
    body, _ = await _register(client)
    assert body["user"]["email_verified"] is False
    message = mailbox.outbox[-1]
    assert message.to == body["user"]["email"]

    ok = await client.post("/api/auth/verify-email", json={"token": _token_from(message)})
    assert ok.status_code == 200
    me = await client.get("/api/auth/me", headers=_bearer(body["access_token"]))
    assert me.json()["email_verified"] is True

    again = await client.post("/api/auth/verify-email", json={"token": _token_from(message)})
    assert again.status_code == 401


async def test_unverified_accounts_cannot_create_reports_when_required(
    client: AsyncClient, mailbox, monkeypatch
):
    monkeypatch.setenv("REQUIRE_VERIFIED_EMAIL", "true")
    get_settings.cache_clear()
    try:
        body, _ = await _register(client)
        report = {"title": "Pothole", "description": "Deep", "category": "road"}

        blocked = await client.post("/api/reports", json=report, headers=_bearer(body["access_token"]))
        assert blocked.status_code == 403

        await client.post("/api/auth/verify-email", json={"token": _token_from(mailbox.outbox[-1])})
        allowed = await client.post("/api/reports", json=report, headers=_bearer(body["access_token"]))
        assert allowed.status_code == 201
    finally:
        get_settings.cache_clear()


# --- email change (1161) -----------------------------------------------------------------


async def test_email_change_needs_confirmation_from_the_new_address(client: AsyncClient, mailbox, db_session):
    body, creds = await _register(client)
    new_email = f"moved_{uuid.uuid4().hex[:6]}@test.com"
    mailbox.outbox.clear()

    res = await client.patch(
        "/api/users/me",
        json={"email": new_email, "current_password": PASSWORD},
        headers=_bearer(body["access_token"]),
    )
    assert res.status_code == 200
    assert res.json()["email"] == creds["email"]
    assert res.json()["pending_email"] == new_email
    assert mailbox.outbox[0].to == new_email

    confirm = await client.post(
        "/api/auth/confirm-email-change", json={"token": _token_from(mailbox.outbox[0])}
    )
    assert confirm.status_code == 200
    user = (await db_session.execute(select(User).where(User.id == uuid.UUID(body["user"]["id"])))).scalar_one()
    await db_session.refresh(user)
    assert user.email == new_email
    assert user.pending_email is None
    assert user.email_verified is True
