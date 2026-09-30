from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.core.exceptions import AppError, ConflictError


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    content: dict[str, object] = {"message": exc.message}
    if isinstance(exc, ConflictError) and exc.field:
        content["field"] = exc.field
    return JSONResponse(status_code=exc.status_code, content=content)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"message": str(exc.detail)})


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {"field": ".".join(str(loc) for loc in err["loc"] if loc != "body"), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"message": "Validation error", "errors": errors})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"message": "Internal server error"})
