from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
import src.models  # noqa: F401
from src.core.config import get_settings
from src.core.error_handler import app_error_handler, validation_error_handler
from src.core.exceptions import AppError
from src.core.middleware import (
    RequestIdMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    setup_cors,
)
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from src.core.limiter import limiter
from src.core.logging import configure_logging
from src.core.router import router as core_router
from src.core.schemas import ApiError
from src.modules.auth.router import router as auth_router
from src.modules.users.router import router as users_router
from src.modules.reports.router import router as reports_router
from src.modules.cases.router import router as cases_router
from src.modules.notifications.router import router as notifications_router
from src.modules.moderation.router import router as moderation_router


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title="Sidewalk API",
        version=settings.API_VERSION,
        responses={
            400: {"model": ApiError, "description": "Bad Request"},
            401: {"model": ApiError, "description": "Unauthorized"},
            403: {"model": ApiError, "description": "Forbidden"},
            404: {"model": ApiError, "description": "Not Found"},
            409: {"model": ApiError, "description": "Conflict"},
            422: {"model": ApiError, "description": "Validation Error"},
        },
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    setup_cors(app, settings)
    app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(RequestLoggingMiddleware)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    app.include_router(core_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(reports_router, prefix="/api")
    app.include_router(cases_router, prefix="/api")
    app.include_router(notifications_router, prefix="/api")
    app.include_router(moderation_router, prefix="/api")

    return app


app = create_app()
