import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.enums import REPORT_STATUS_TRANSITIONS, NotificationType, ReportStatus
from src.core.exceptions import InvalidTransitionError, NotFoundError
from src.modules.notifications.service import create_notification
from src.modules.reports.models import Report


async def get_report_by_id(db: AsyncSession, report_id: uuid.UUID) -> Report:
    stmt = select(Report).where(Report.id == report_id, Report.is_deleted == False)  # noqa: E712
    result = await db.execute(stmt)
    report = result.scalar_one_or_none()
    if not report:
        raise NotFoundError("Report not found")
    return report


async def flag_report(db: AsyncSession, report_id: uuid.UUID, reason: str) -> Report:
    report = await get_report_by_id(db, report_id)
    report.flagged = True
    report.flag_reason = reason
    await db.commit()
    await db.refresh(report)
    return report


async def update_report_status(
    db: AsyncSession,
    report_id: uuid.UUID,
    status: ReportStatus,
    notes: str | None = None,
) -> Report:
    report = await get_report_by_id(db, report_id)
    current_status = ReportStatus(report.status)
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
    await db.commit()
    await db.refresh(report)
    return report
