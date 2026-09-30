import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.enums import ReportCategory, ReportStatus
from src.core.exceptions import ForbiddenError, NotFoundError
from src.modules.auth.models import User
from src.modules.reports import repository as report_repo
from src.modules.reports.schemas import CreateReportRequest, ReportResponse, UpdateReportRequest

log = structlog.get_logger(__name__)


async def create_report(
    db: AsyncSession, user_id: uuid.UUID, payload: CreateReportRequest
) -> ReportResponse:
    report = await report_repo.create_report(
        db,
        user_id=user_id,
        title=payload.title,
        description=payload.description,
        category=payload.category.value,
        status=ReportStatus.submitted.value,
        latitude=payload.latitude,
        longitude=payload.longitude,
        address=payload.address,
        media_urls=payload.media_urls,
    )
    await db.commit()
    log.info("create_report", report_id=str(report.id), user_id=str(user_id))
    return ReportResponse.model_validate(report)


async def get_report(db: AsyncSession, report_id: uuid.UUID) -> ReportResponse:
    report = await report_repo.get_report_by_id(db, report_id)
    if not report:
        raise NotFoundError("Report not found")
    return ReportResponse.model_validate(report)


async def list_reports(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    category: ReportCategory | None = None,
    status: ReportStatus | None = None,
    user_id: uuid.UUID | None = None,
) -> list[ReportResponse]:
    cat_str = category.value if category else None
    stat_str = status.value if status else None
    reports = await report_repo.list_reports(
        db, skip=skip, limit=limit, category=cat_str, status=stat_str, user_id=user_id
    )
    return [ReportResponse.model_validate(r) for r in reports]


async def update_report(
    db: AsyncSession, report_id: uuid.UUID, user: User, payload: UpdateReportRequest
) -> ReportResponse:
    report = await report_repo.get_report_by_id(db, report_id)
    if not report:
        raise NotFoundError("Report not found")
    if report.user_id != user.id and not user.is_admin:
        raise ForbiddenError("You are not authorized to modify this report")

    data = payload.model_dump(exclude_none=True)
    if "category" in data and isinstance(data["category"], ReportCategory):
        data["category"] = data["category"].value
    if "status" in data and isinstance(data["status"], ReportStatus):
        data["status"] = data["status"].value
    updated = await report_repo.update_report(db, report, **data)
    await db.commit()
    log.info("update_report", report_id=str(report.id))
    return ReportResponse.model_validate(updated)


async def delete_report(db: AsyncSession, report_id: uuid.UUID, user: User) -> None:
    report = await report_repo.get_report_by_id(db, report_id)
    if not report:
        raise NotFoundError("Report not found")
    if report.user_id != user.id and not user.is_admin:
        raise ForbiddenError("You are not authorized to modify this report")

    await report_repo.soft_delete_report(db, report)
    await db.commit()
    log.info("delete_report", report_id=str(report.id))
