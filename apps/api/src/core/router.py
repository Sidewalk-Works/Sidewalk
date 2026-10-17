# apps/api/src/core/router.py
import os

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

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
        db_status = f"error: {e!s}"
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
