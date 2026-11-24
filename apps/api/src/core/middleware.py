import re
import time
import uuid

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.core.config import Settings

logger = structlog.get_logger(__name__)

# Only identifiers of this shape are echoed into logs and response headers.
REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9-]{1,64}")

CORS_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOWED_HEADERS = ["Authorization", "Content-Type", "Accept", "X-Request-ID"]
CORS_EXPOSED_HEADERS = ["X-Request-ID", "Retry-After"]


def setup_cors(app: FastAPI, settings: Settings) -> None:
    # Authentication uses a bearer header, not cookies, so credentials are not allowed.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=CORS_ALLOWED_METHODS,
        allow_headers=CORS_ALLOWED_HEADERS,
        expose_headers=CORS_EXPOSED_HEADERS,
    )


API_CSP = "default-src 'self'"
DOCS_PATHS = ("/docs", "/redoc")
DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.redoc.ly; "
    "worker-src 'self' blob:"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, environment: str = "development"):
        super().__init__(app)
        self.environment = environment

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
        # The interactive docs load their UI from a CDN, so they get a relaxed policy.
        # Everything else (the JSON API) keeps the strict one.
        response.headers["Content-Security-Policy"] = (
            DOCS_CSP if request.url.path.startswith(DOCS_PATHS) else API_CSP
        )
        if self.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class RequestIdMiddleware:
    """
    Pure ASGI middleware. It must be the outermost custom middleware so every other layer
    sees the request id. A client-supplied ``X-Request-ID`` is honored only if it matches
    ``REQUEST_ID_PATTERN``; otherwise a UUID is generated. Log context is reset per request.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id")
        request_id = incoming if incoming and REQUEST_ID_PATTERN.fullmatch(incoming) else None
        request_id = request_id or str(uuid.uuid4())

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_with_request_id)


class RequestLoggingMiddleware:
    """
    Pure ASGI access log. ``request_id`` and ``user_id`` are read from the ASGI scope state
    (set by ``RequestIdMiddleware`` and ``get_current_user``) rather than from context
    variables, which do not cross ``BaseHTTPMiddleware`` task boundaries.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start_time = time.perf_counter()
        status_code = 500

        async def send_capturing_status(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_capturing_status)
        finally:
            state = scope.get("state", {})
            fields = {
                key: state[key] for key in ("request_id", "user_id") if state.get(key) is not None
            }
            logger.info(
                "http_request",
                method=scope["method"],
                path=scope["path"],
                status_code=status_code,
                duration_ms=round((time.perf_counter() - start_time) * 1000),
                **fields,
            )
