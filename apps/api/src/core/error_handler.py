import structlog
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.core.exceptions import AppError, ConflictError

log = structlog.get_logger(__name__)

HTTP_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
}
DEFAULT_RETRY_AFTER_SECONDS = 60


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None) or structlog.contextvars.get_contextvars().get(
        "request_id"
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    content: dict[str, object] = {"code": exc.code, "message": exc.message}
    if isinstance(exc, ConflictError) and exc.field:
        content["field"] = exc.field
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    return JSONResponse(status_code=exc.status_code, content=content, headers=headers)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = HTTP_STATUS_CODES.get(exc.status_code, "http_error")
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "message": str(exc.detail)},
        headers=getattr(exc, "headers", None),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"field": ".".join(str(loc) for loc in err["loc"] if loc != "body"), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"code": "validation_error", "message": "Validation error", "errors": errors},
    )


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    try:
        retry_after = int(exc.limit.limit.get_expiry())
    except (AttributeError, TypeError, ValueError):
        retry_after = DEFAULT_RETRY_AFTER_SECONDS
    log.warning(
        "rate_limit_exceeded",
        method=request.method,
        path=request.url.path,
        limit=str(getattr(exc, "detail", "")),
        request_id=_request_id(request),
    )
    return JSONResponse(
        status_code=429,
        content={"code": "rate_limited", "message": "Too many requests. Please try again later."},
        headers={"Retry-After": str(retry_after)},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # The body stays generic; the traceback goes to the logs with enough context to find it.
    log.exception(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        request_id=_request_id(request),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500, content={"code": "internal_error", "message": "Internal server error"}
    )
