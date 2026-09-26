from typing import TYPE_CHECKING
from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.models import Base, TimestampMixin, UUIDPKMixin
from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report

if TYPE_CHECKING:
    from src.modules.reports.models import Report


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    reports: Mapped[list["Report"]] = relationship("Report", back_populates="user", lazy="selectin")
