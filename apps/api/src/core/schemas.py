from pydantic import BaseModel


class FieldError(BaseModel):
    field: str
    message: str


class ApiError(BaseModel):
    message: str
    errors: list[FieldError] | None = None
