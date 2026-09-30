class AppError(Exception):
    status_code: int = 500

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


class UnauthorizedError(AppError):
    status_code = 401


class ForbiddenError(AppError):
    status_code = 403


class TooManyRequestsError(AppError):
    status_code = 429


class InvalidTokenError(AppError):
    status_code = 401


class UserNotFoundError(NotFoundError):
    def __init__(self, message: str = "User not found"):
        super().__init__(message)


class ValidationError(AppError):
    status_code = 422


class InvalidTransitionError(ValidationError):
    def __init__(self, message: str = "Invalid status transition"):
        super().__init__(message)
