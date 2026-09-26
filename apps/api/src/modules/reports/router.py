import uuid
from fastapi import APIRouter, Query, Response, status
from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.core.enums import ReportCategory, ReportStatus
from src.modules.reports.schemas import CreateReportRequest, ReportResponse, UpdateReportRequest
from src.modules.reports import service as report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(
    payload: CreateReportRequest, current_user: CurrentUser, db: DBSession
) -> ReportResponse:
    return await report_service.create_report(db, current_user.id, payload)


@router.get("", response_model=list[ReportResponse])
async def list_reports(
    db: DBSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: ReportCategory | None = None,
    status: ReportStatus | None = None,
    user_id: uuid.UUID | None = None,
) -> list[ReportResponse]:
    return await report_service.list_reports(
        db, skip=skip, limit=limit, category=category, status=status, user_id=user_id
    )


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: uuid.UUID, db: DBSession) -> ReportResponse:
    return await report_service.get_report(db, report_id)


@router.patch("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: uuid.UUID,
    payload: UpdateReportRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> ReportResponse:
    return await report_service.update_report(db, report_id, current_user, payload)


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: uuid.UUID, current_user: CurrentUser, db: DBSession
) -> Response:
    await report_service.delete_report(db, report_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
