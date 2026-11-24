import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.core.config import get_settings
from src.core.database import DBSession

router = APIRouter(tags=["core"])
log = structlog.get_logger(__name__)


@router.get("/health/live")
async def live() -> dict[str, str]:
    """Liveness: the process is up. Never touches the database."""
    return {"status": "ok"}


@router.get("/health/ready", response_model=None)
async def ready(db: DBSession) -> dict[str, str] | JSONResponse:
    """Readiness: the database answers. Failure is a generic 503; details go to the logs."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        log.exception("health_database_check_failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok", "version": get_settings().API_VERSION}


@router.get("/health", response_model=None)
async def health(db: DBSession) -> dict[str, str] | JSONResponse:
    """Backwards-compatible alias for ``/health/ready``."""
    return await ready(db)
