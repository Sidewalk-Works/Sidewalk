import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from src.modules.auth.models import User
    from src.modules.reports.models import Report


class Case(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "cases"

    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reports.id"), unique=True, index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="opened", nullable=False, index=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )

    report: Mapped["Report"] = relationship("Report")
    assigned_to: Mapped["User | None"] = relationship("User")
    followers: Mapped[list["CaseFollow"]] = relationship(
        "CaseFollow", back_populates="case", cascade="all, delete-orphan"
    )


class CaseFollow(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "case_follows"
    __table_args__ = (UniqueConstraint("case_id", "user_id", name="uq_case_user_follow"),)

    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cases.id"), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    case: Mapped["Case"] = relationship("Case", back_populates="followers")
    user: Mapped["User"] = relationship("User")
