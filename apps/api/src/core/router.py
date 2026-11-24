# apps/api/src/core/router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import os

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.core.config import get_settings
from src.core.database import DBSession

router = APIRouter(tags=["core"])
log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api", tags=["core"])

@router.get("/health")
async def health_check():
    """
    Health check endpoint verifying application status, environment,
    version, and live database connectivity. Returns 200 OK or 503 Service Unavailable.
    """
    version = os.getenv("API_VERSION", "0.1.0")
    environment = os.getenv("NODE_ENV", "development")
    
    db_status = "ok"
    status_code = status.HTTP_200_OK

    try:
        # Attempt lightweight database connectivity check (SELECT 1)
        # Assumes a session dependency or engine is available in app state / dependency injection
        from src.core.database import AsyncSessionLocal
        if AsyncSessionLocal:
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
        else:
            db_status = "ok (no-engine-bound)"
    except Exception as e:
        db_status = f"error: {str(e)}"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    payload = {
        "status": "ok" if status_code == status.HTTP_200_OK else "degraded",
        "version": version,
        "environment": environment,
        "db": db_status,
    }

    if status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status_code, detail=payload)

    return payload
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