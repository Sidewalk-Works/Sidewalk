import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from src.modules.reports.models import Report


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Bumped on logout, password change and reset: every access token carries the version
    # it was issued under, so a bump revokes all of the user's outstanding tokens at once.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    pending_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    reports: Mapped[list["Report"]] = relationship("Report", back_populates="user", lazy="selectin")


class AuthToken(Base, UUIDPKMixin, TimestampMixin):
    """
    A single-purpose, single-use secret (refresh token, password reset, email
    verification or email change). Only the SHA-256 of the secret is stored.
    """

    __tablename__ = "auth_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # For ``email_change`` tokens: the address the account will switch to.
    extra: Mapped[str | None] = mapped_column(String(255), nullable=True)
