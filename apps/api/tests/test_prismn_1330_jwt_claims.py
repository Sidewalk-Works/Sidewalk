import uuid

import jwt
import pytest

from src.core.prismn_1330_jwt_claims import (
    REQUIRED_CLAIMS,
    create_access_token_with_claims,
    decode_access_token_with_claims,
)


SECRET = "test-secret-key-at-least-32-chars-long"
ALG = "HS256"
ISS = "sidewalk-api"
AUD = "sidewalk-clients"


def _make_token(**overrides):
    data = {"sub": str(uuid.uuid4())}
    data.update(overrides.pop("data", {}))
    params = dict(
        data=data,
        secret_key=SECRET,
        algorithm=ALG,
        expires_minutes=60,
        issuer=ISS,
        audience=AUD,
    )
    params.update(overrides)
    return create_access_token_with_claims(**params)


def test_token_contains_required_and_identity_claims():
    token = _make_token()
    decoded = decode_access_token_with_claims(
        token, secret_key=SECRET, algorithm=ALG, issuer=ISS, audience=AUD
    )
    for claim in (*REQUIRED_CLAIMS, "iss", "aud", "jti"):
        assert claim in decoded
    assert decoded["iss"] == ISS
    assert decoded["aud"] == AUD


def test_missing_required_claims_rejected():
    # Build a token without iat/sub/exp as required by decode options.
    payload = {"iss": ISS, "aud": AUD, "jti": "x"}
    token = jwt.encode(payload, SECRET, algorithm=ALG)
    with pytest.raises(jwt.PyJWTError):
        decode_access_token_with_claims(
            token, secret_key=SECRET, algorithm=ALG, issuer=ISS, audience=AUD
        )


def test_wrong_issuer_rejected():
    token = _make_token(issuer="other-issuer")
    with pytest.raises(jwt.InvalidIssuerError):
        decode_access_token_with_claims(
            token, secret_key=SECRET, algorithm=ALG, issuer=ISS, audience=AUD
        )


def test_wrong_audience_rejected():
    token = _make_token(audience="other-aud")
    with pytest.raises(jwt.InvalidAudienceError):
        decode_access_token_with_claims(
            token, secret_key=SECRET, algorithm=ALG, issuer=ISS, audience=AUD
        )
