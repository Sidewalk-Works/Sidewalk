import uuid

from fastapi import APIRouter

from src.core.database import DBSession
from src.modules.moderation import service as moderation_service
from src.modules.moderation.dependencies import AdminUser
from src.modules.moderation.schemas import FlagReport, UpdateReportStatus
from src.modules.reports.schemas import ReportResponse

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.post("/reports/{report_id}/flag", response_model=ReportResponse)
async def flag_report(
    report_id: uuid.UUID,
    payload: FlagReport,
    _: AdminUser,
    db: DBSession,
) -> ReportResponse:
    report = await moderation_service.flag_report(db, report_id, payload.reason)
    return ReportResponse.model_validate(report)


@router.patch("/reports/{report_id}/status", response_model=ReportResponse)
async def update_status(
    report_id: uuid.UUID,
    payload: UpdateReportStatus,
    _: AdminUser,
    db: DBSession,
) -> ReportResponse:
    report = await moderation_service.update_report_status(
        db, report_id, payload.status, payload.notes
    )
    return ReportResponse.model_validate(report)
