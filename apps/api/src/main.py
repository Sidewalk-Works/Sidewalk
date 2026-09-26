from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
import src.models  # noqa: F401
from src.core.config import get_settings
from src.core.error_handler import app_error_handler, validation_error_handler
from src.core.exceptions import AppError
from src.core.middleware import (
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    setup_cors,
)
from src.core.router import router as core_router
from src.modules.auth.router import router as auth_router
from src.modules.users.router import router as users_router
from src.modules.reports.router import router as reports_router
from src.modules.cases.router import router as cases_router
from src.modules.notifications.router import router as notifications_router
from src.modules.moderation.router import router as moderation_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Sidewalk API", version=settings.API_VERSION)

    setup_cors(app, settings)
    app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)
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
