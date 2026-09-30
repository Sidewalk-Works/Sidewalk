import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.enums import NotificationType
from src.core.models import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from src.modules.auth.models import User


class Notification(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        SAEnum(NotificationType, values_callable=lambda x: [e.value for e in x], native_enum=False),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    user: Mapped["User"] = relationship("User")
