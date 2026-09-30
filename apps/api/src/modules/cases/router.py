import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from src.core.database import DBSession
from src.core.dependencies import CurrentUser
from src.core.enums import CaseStatus
from src.core.pagination import PageParams, PaginatedResponse
from src.modules.cases import service as cases_service
from src.modules.cases.schemas import CaseResponse

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=PaginatedResponse[CaseResponse])
async def list_cases(
    db: DBSession,
    params: Annotated[PageParams, Depends()],
    status: CaseStatus | None = None,
) -> PaginatedResponse[CaseResponse]:
    return await cases_service.list_cases(db, params, status)


@router.post("/{case_id}/follow", status_code=204)
async def follow_case(
    case_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    await cases_service.follow_case(db, case_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{case_id}/follow", status_code=204)
async def unfollow_case(
    case_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    await cases_service.unfollow_case(db, case_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
