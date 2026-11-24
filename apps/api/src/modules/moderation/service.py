import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.enums import REPORT_STATUS_TRANSITIONS, NotificationType, ReportStatus
from src.core.exceptions import InvalidTransitionError, NotFoundError
from src.modules.notifications.service import create_notification
from src.modules.reports import repository as report_repo
from src.modules.reports.models import Report

log = structlog.get_logger(__name__)


async def get_report_by_id(db: AsyncSession, report_id: uuid.UUID) -> Report:
    report = await report_repo.get_report_by_id(db, report_id)
    if not report:
        raise NotFoundError("Report not found")
    return report


async def flag_report(db: AsyncSession, report_id: uuid.UUID, reason: str) -> Report:
    report = await get_report_by_id(db, report_id)
    report.flagged = True
    report.flag_reason = reason
    await db.flush()
    await db.refresh(report)
    log.info("flag_report", report_id=str(report_id))
    return report


async def update_report_status(
    db: AsyncSession,
    report_id: uuid.UUID,
    status: ReportStatus,
    notes: str | None = None,
) -> Report:
    report = await get_report_by_id(db, report_id)
    try:
        current_status = ReportStatus(report.status)
    except ValueError:
        raise InvalidTransitionError(f"Invalid current status: {report.status}")

    valid_transitions = REPORT_STATUS_TRANSITIONS.get(current_status, [])

    if status not in valid_transitions:
        allowed = [s.value for s in valid_transitions]
        raise InvalidTransitionError(
            f"Cannot transition status from '{current_status.value}' to '{status.value}'. Valid transitions: {allowed}"
        )

    report.status = status.value
    await create_notification(
        db,
        user_id=report.user_id,
        type=NotificationType.status_change,
        payload={"report_id": str(report.id), "status": status.value, "notes": notes},
    )
    await db.flush()
    await db.refresh(report)
    log.info("update_report_status", report_id=str(report.id), status=status.value)
    return report
