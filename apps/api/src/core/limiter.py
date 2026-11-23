from slowapi import Limiter
from starlette.requests import Request

from src.core.config import get_settings

settings = get_settings()


def client_ip(request: Request) -> str:
    """
    The caller's address for rate limiting.

    The socket peer is used unless it is one of ``TRUSTED_PROXY_IPS``; in that case the
    right-most ``X-Forwarded-For`` entry that is not itself a trusted proxy is the client.
    A header sent by an untrusted peer is ignored, so it cannot be used to dodge limits.
    """
    peer = request.client.host if request.client else "unknown"
    trusted = get_settings().trusted_proxy_ips
    if peer not in trusted:
        return peer
    forwarded = request.headers.get("x-forwarded-for", "")
    for candidate in reversed([part.strip() for part in forwarded.split(",") if part.strip()]):
        if candidate not in trusted:
            return candidate
    return peer


limiter = Limiter(
    key_func=client_ip,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
)
