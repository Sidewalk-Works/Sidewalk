class AppError(Exception):
    """Base for errors raised on purpose. ``code`` is a stable, machine-readable identifier."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, code: str | None = None):
        self.message = message
        if code is not None:
            self.code = code
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"

    def __init__(self, message: str, field: str | None = None, code: str | None = None):
        super().__init__(message, code)
        self.field = field


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class TooManyRequestsError(AppError):
    status_code = 429
    code = "rate_limited"


class InvalidTokenError(AppError):
    status_code = 401
    code = "invalid_token"


class UserNotFoundError(NotFoundError):
    code = "user_not_found"

    def __init__(self, message: str = "User not found"):
        super().__init__(message)


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class InvalidTransitionError(ValidationError):
    code = "invalid_transition"

    def __init__(self, message: str = "Invalid status transition"):
        super().__init__(message)
