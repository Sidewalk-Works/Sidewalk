from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
import src.models  # noqa: F401
from starlette.exceptions import HTTPException as StarletteHTTPException
from src.core.config import get_settings
from src.core.error_handler import (
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
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
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.include_router(core_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(reports_router, prefix="/api")
    app.include_router(cases_router, prefix="/api")
    app.include_router(notifications_router, prefix="/api")
    app.include_router(moderation_router, prefix="/api")

    return app


app = create_app()

# Configure logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("sidewalk.api")

def create_app() -> FastAPI:
    """
    FastAPI application factory for Sidewalk API.
    Instantiates and configures middleware, exception handlers, and routers.
    """
    settings = get_settings()

    app = FastAPI(
        title="Sidewalk API",
        version=settings.API_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # 1. Attach CORS middleware
    setup_cors(app, settings)

    # 2. Attach request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info(f"Incoming request: {request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"Completed response: {response.status_code} for {request.method} {request.url.path}")
        return response

    # 3. Attach security headers middleware
    app.add_middleware(SecurityHeadersMiddleware)

    # 4. Attach global exception handlers
    @app.exception_handler(StarletteHTTPException)
    async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
        return FastAPI().default_exception_handler(request, exc) if hasattr(FastAPI, 'default_exception_handler') else {
            "success": False,
            "error": {
                "code": "HTTP_ERROR",
                "message": exc.detail,
            },
            "meta": {"status_code": exc.status_code}
        }

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return {
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request parameters or payload.",
                "details": exc.errors(),
            }
        }

    # 5. Register module routers under /api prefix
    app.include_router(core_router)

    # 6. Startup event logging
    @app.on_event("startup")
    async def startup_event():
        logger.info("Sidewalk API starting up...")

    return app

# Top-level app instance for uvicorn pickup
app = create_app()


from fastapi import FastAPI

app = FastAPI(title="Sidewalk API", version="0.1.0")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}