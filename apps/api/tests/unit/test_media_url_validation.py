import pytest
from pydantic import ValidationError

from src.core.config import get_settings
from src.modules.reports.schemas import CreateReportRequest, UpdateReportRequest


def _create(urls):
    return CreateReportRequest(title="Pothole", description="Deep", category="road", media_urls=urls)


@pytest.fixture(autouse=True)
def _reset_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_https_urls_are_accepted():
    assert _create(["https://example.com/a.png"]).media_urls == ["https://example.com/a.png"]


@pytest.mark.parametrize(
    "url",
    ["http://example.com/a.png", "ftp://example.com/a.png", "javascript:alert(1)", "not a url", "https://"],
)
def test_non_https_or_malformed_urls_are_rejected(url):
    with pytest.raises(ValidationError):
        _create([url])


def test_over_long_urls_are_rejected():
    with pytest.raises(ValidationError, match="exceeds"):
        _create(["https://example.com/" + "a" * 2100])


def test_more_than_ten_urls_are_rejected():
    with pytest.raises(ValidationError):
        _create([f"https://example.com/{i}.png" for i in range(11)])


def test_allowed_hosts_restrict_the_media_host(monkeypatch):
    monkeypatch.setenv("MEDIA_ALLOWED_HOSTS", "cdn.example.com, media.example.org")
    get_settings.cache_clear()

    assert _create(["https://cdn.example.com/a.png"]).media_urls
    with pytest.raises(ValidationError, match="not allowed"):
        _create(["https://evil.example.net/a.png"])


def test_update_request_applies_the_same_rules():
    assert UpdateReportRequest(media_urls=None).media_urls is None
    with pytest.raises(ValidationError):
        UpdateReportRequest(media_urls=["http://example.com/a.png"])
