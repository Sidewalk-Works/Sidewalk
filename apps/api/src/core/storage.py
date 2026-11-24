from __future__ import annotations

import uuid
from dataclasses import dataclass

from src.core.config import get_settings
from src.core.exceptions import ValidationError


@dataclass
class PresignedUpload:
    upload_url: str
    media_url: str
    method: str = "PUT"
    headers: dict[str, str] | None = None


class MediaStorage:
    def presign_upload(self, *, filename: str, content_type: str, size_bytes: int) -> PresignedUpload:
        raise NotImplementedError


class LocalFakeMediaStorage(MediaStorage):
    """Local/fake storage for development and tests. Returns deterministic https URLs."""

    def presign_upload(self, *, filename: str, content_type: str, size_bytes: int) -> PresignedUpload:
        settings = get_settings()
        allowed = settings.media_allowed_content_types
        if content_type.lower() not in allowed:
            raise ValidationError(f"Unsupported media type: {content_type}", field="content_type")
        if size_bytes <= 0 or size_bytes > settings.MEDIA_MAX_UPLOAD_BYTES:
            raise ValidationError(
                f"File size must be between 1 and {settings.MEDIA_MAX_UPLOAD_BYTES} bytes",
                field="size_bytes",
            )
        safe_name = "".join(ch for ch in filename if ch.isalnum() or ch in "._-") or "upload"
        key = f"reports/{uuid.uuid4().hex}-{safe_name}"
        base = settings.MEDIA_LOCAL_BASE_URL.rstrip("/")
        media_url = f"{base}/{key}"
        # Fake upload target: in local/test mode clients can treat upload_url as a no-op target.
        return PresignedUpload(
            upload_url=media_url,
            media_url=media_url,
            method="PUT",
            headers={"Content-Type": content_type},
        )


def get_media_storage() -> MediaStorage:
    backend = get_settings().MEDIA_STORAGE_BACKEND.lower()
    if backend == "local":
        return LocalFakeMediaStorage()
    raise ValidationError(f"Unsupported media storage backend: {backend}")
