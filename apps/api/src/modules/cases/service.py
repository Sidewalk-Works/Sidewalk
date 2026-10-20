import uuid

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.enums import CaseStatus
from src.core.exceptions import NotFoundError
from src.core.pagination import PageParams, PaginatedResponse
from src.modules.cases.models import Case, CaseFollow
from src.modules.cases.schemas import CaseResponse

log = structlog.get_logger(__name__)


async def get_case_by_id(db: AsyncSession, case_id: uuid.UUID) -> Case:
    stmt = select(Case).where(Case.id == case_id)
    result = await db.execute(stmt)
    case = result.scalar_one_or_none()
    if not case:
        raise NotFoundError("Case not found")
    return case


async def list_cases(
    db: AsyncSession,
    params: PageParams,
    status: CaseStatus | None = None,
) -> PaginatedResponse[CaseResponse]:
    query = select(Case)
    count_query = select(func.count()).select_from(Case)

    if status:
        status_val = status.value if hasattr(status, "value") else str(status)
        # Accept legacy 'opened' as an alias for the canonical 'open' status
        # for backward compatibility for one release.
        if status_val == "open" or status_val == "opened":
            query = query.where(Case.status == "open")
            count_query = count_query.where(Case.status == "open")
        else:
            query = query.where(Case.status == status_val)
            count_query = count_query.where(Case.status == status_val)

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(Case.created_at.desc()).offset(params.offset).limit(params.limit)
    result = await db.execute(query)
    cases = list(result.scalars().all())

    items = [CaseResponse.model_validate(c) for c in cases]
    return PaginatedResponse(
        items=items,
        total=total,
        limit=params.limit,
        offset=params.offset,
        has_more=(params.offset + len(items)) < total,
    )


async def follow_case(db: AsyncSession, case_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await get_case_by_id(db, case_id)
    stmt = select(CaseFollow).where(CaseFollow.case_id == case_id, CaseFollow.user_id == user_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if not existing:
        follow = CaseFollow(case_id=case_id, user_id=user_id)
        db.add(follow)
        await db.flush()
    log.info("follow_case", case_id=str(case_id), user_id=str(user_id))


async def unfollow_case(db: AsyncSession, case_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await get_case_by_id(db, case_id)
    stmt = delete(CaseFollow).where(CaseFollow.case_id == case_id, CaseFollow.user_id == user_id)
    await db.execute(stmt)
    await db.flush()
    log.info("unfollow_case", case_id=str(case_id), user_id=str(user_id))


async def is_case_followed(db: AsyncSession, case_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    stmt = select(CaseFollow).where(CaseFollow.case_id == case_id, CaseFollow.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def get_case_detail(db: AsyncSession, case_id: uuid.UUID, user) -> "CaseDetailResponse":
    from src.modules.cases.schemas import CaseDetailResponse

    case = await get_case_by_id(db, case_id)
    follower_count_stmt = select(func.count()).select_from(CaseFollow).where(
        CaseFollow.case_id == case_id
    )
    follower_count_res = await db.execute(follower_count_stmt)
    follower_count = follower_count_res.scalar() or 0
    is_following = False
    if user is not None and getattr(user, "id", None) is not None:
        is_following = await is_case_followed(db, case_id, user.id)
    data = CaseDetailResponse.model_validate(case)
    data.follower_count = follower_count
    data.is_following = is_following
    return data
