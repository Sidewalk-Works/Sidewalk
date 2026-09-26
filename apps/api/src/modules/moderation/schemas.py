from pydantic import BaseModel, Field
from src.core.enums import ReportStatus


class FlagReport(BaseModel):
    reason: str = Field(min_length=1, max_length=255)


class UpdateReportStatus(BaseModel):
    status: ReportStatus
    notes: str | None = None
