from pydantic import BaseModel


class FieldError(BaseModel):
    field: str
    message: str


class ApiError(BaseModel):
    """Error body returned by every failing route.

    ``code`` is a stable identifier clients should branch on (see ``docs/error-codes.md``);
    ``message`` is human-readable and may change.
    """

    code: str
    message: str
    field: str | None = None
    errors: list[FieldError] | None = None
