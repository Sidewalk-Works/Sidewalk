import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.modules.reports.models import Report


async def create_report(db: AsyncSession, user_id: uuid.UUID, **fields: Any) -> Report:
    report = Report(user_id=user_id, **fields)
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


async def get_report_by_id(db: AsyncSession, report_id: uuid.UUID) -> Report | None:
    stmt = select(Report).where(Report.id == report_id, Report.is_deleted.is_(False))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_reports(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    category: str | None = None,
    status: str | None = None,
    user_id: uuid.UUID | None = None,
) -> list[Report]:
    stmt = select(Report).where(Report.is_deleted.is_(False))
    if category is not None:
        stmt = stmt.where(Report.category == category)
    if status is not None:
        stmt = stmt.where(Report.status == status)
    if user_id is not None:
        stmt = stmt.where(Report.user_id == user_id)
    stmt = stmt.order_by(Report.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_report(db: AsyncSession, report: Report, **fields: Any) -> Report:
    for key, value in fields.items():
        setattr(report, key, value)
    await db.flush()
    await db.refresh(report)
    return report


async def soft_delete_report(db: AsyncSession, report: Report) -> None:
    report.is_deleted = True
    await db.flush()
