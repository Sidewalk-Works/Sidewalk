from fastapi import APIRouter, Response
from sqlalchemy import text
from src.core.config import get_settings
from src.core.database import DBSession

router = APIRouter(prefix="", tags=["core"])


@router.get("/health")
async def health_check(db: DBSession, response: Response):
    settings = get_settings()
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"error: {exc}"

    # The top-level status must reflect the DB check, not just report "ok"
    # unconditionally - otherwise an orchestrator/monitor polling this
    # endpoint has no way to detect a database outage from this field.
    is_healthy = db_status == "ok"
    response.status_code = 200 if is_healthy else 503
    return {
        "status": "ok" if is_healthy else "degraded",
        "version": settings.API_VERSION,
        "environment": settings.ENVIRONMENT,
        "db": db_status,
    }
