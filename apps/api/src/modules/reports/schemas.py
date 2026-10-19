import uuid
from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    TypeAdapter,
    model_validator,
)

from src.core.config import get_settings
from src.core.enums import ReportCategory, ReportStatus

MAX_MEDIA_URL_LENGTH = 2048
MAX_MEDIA_URLS = 10
_http_url = TypeAdapter(HttpUrl)


def validate_media_urls(urls: list[str]) -> list[str]:
    """
    Media links are rendered by the web and mobile clients, so each one must be a bounded,
    well-formed https URL and, when ``MEDIA_ALLOWED_HOSTS`` is set, served from an allowed host.
    """
    allowed_hosts = get_settings().media_allowed_hosts
    for url in urls:
        if len(url) > MAX_MEDIA_URL_LENGTH:
            raise ValueError(f"Media URL exceeds {MAX_MEDIA_URL_LENGTH} characters")
        try:
            parsed = _http_url.validate_python(url)
        except ValueError:
            raise ValueError(f"Invalid media URL: {url[:100]}") from None
        if parsed.scheme != "https":
            raise ValueError("Media URLs must use https")
        if allowed_hosts and (parsed.host or "").lower() not in allowed_hosts:
            raise ValueError(f"Media host is not allowed: {parsed.host}")
    return urls


MediaUrls = Annotated[list[str], Field(max_length=MAX_MEDIA_URLS), AfterValidator(validate_media_urls)]


class CreateReportRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=1)
    category: ReportCategory
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=500)
    media_urls: MediaUrls = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_location(self) -> "CreateReportRequest":
        if (self.latitude is not None and self.longitude is None) or (
            self.latitude is None and self.longitude is not None
        ):
            raise ValueError("Both latitude and longitude must be provided together, or neither")
        return self


class UpdateReportRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    category: ReportCategory | None = None
    status: ReportStatus | None = None
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=500)
    media_urls: MediaUrls | None = None

    @model_validator(mode="after")
    def validate_location(self) -> "UpdateReportRequest":
        if (self.latitude is not None and self.longitude is None) or (
            self.latitude is None and self.longitude is not None
        ):
            raise ValueError("Both latitude and longitude must be provided together, or neither")
        return self


class ReportResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    category: ReportCategory
    status: ReportStatus
    user_id: uuid.UUID
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    media_urls: list[str] = Field(default_factory=list)
    is_deleted: bool = False
    flagged: bool = False
    flag_reason: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
