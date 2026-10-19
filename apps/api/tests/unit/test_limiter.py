from starlette.requests import Request

from src.core import limiter as limiter_module
from src.core.config import get_settings


def _request(peer: str, forwarded: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    scope = {"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET", "path": "/"}
    return Request(scope)


def test_socket_peer_is_used_when_there_is_no_trusted_proxy(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "")
    get_settings.cache_clear()
    assert limiter_module.client_ip(_request("10.0.0.9", "1.2.3.4")) == "10.0.0.9"


def test_forwarded_header_from_an_untrusted_peer_is_ignored(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.1")
    get_settings.cache_clear()
    assert limiter_module.client_ip(_request("203.0.113.7", "1.2.3.4")) == "203.0.113.7"


def test_client_is_taken_from_forwarded_header_behind_a_trusted_proxy(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.1, 10.0.0.2")
    get_settings.cache_clear()
    # Rightmost entry that is not a trusted proxy is the client; earlier entries are spoofable.
    request = _request("10.0.0.1", "6.6.6.6, 198.51.100.4, 10.0.0.2")
    assert limiter_module.client_ip(request) == "198.51.100.4"


def test_falls_back_to_the_peer_when_every_hop_is_trusted(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.1,10.0.0.2")
    get_settings.cache_clear()
    assert limiter_module.client_ip(_request("10.0.0.1", "10.0.0.2")) == "10.0.0.1"


def teardown_module(_module):
    get_settings.cache_clear()
