"""Standalone helper for issue #1330: add iss, aud, iat and jti claims to JWTs
and require them on decode.

This module is intentionally self-contained so it can be reviewed/adopted without
wiring changes in this PR.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt


REQUIRED_CLAIMS = ("exp", "sub", "iat")


def create_access_token_with_claims(
    data: dict[str, Any],
    *,
    secret_key: str,
    algorithm: str,
    expires_minutes: int,
    issuer: str,
    audience: str,
) -> str:
    to_encode = data.copy()
    now = datetime.now(UTC)
    to_encode.update(
        {
            "exp": now + timedelta(minutes=expires_minutes),
            "iat": now,
            "iss": issuer,
            "aud": audience,
            "jti": to_encode.get("jti") or uuid.uuid4().hex,
        }
    )
    return jwt.encode(to_encode, secret_key, algorithm=algorithm)


def decode_access_token_with_claims(
    token: str,
    *,
    secret_key: str,
    algorithm: str,
    issuer: str,
    audience: str,
) -> dict[str, Any]:
    return jwt.decode(
        token,
        secret_key,
        algorithms=[algorithm],
        issuer=issuer,
        audience=audience,
        options={"require": [*REQUIRED_CLAIMS]},
    )
