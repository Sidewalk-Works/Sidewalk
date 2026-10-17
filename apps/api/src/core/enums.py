import enum


class ReportStatus(enum.StrEnum):
    submitted = "submitted"
    under_review = "under_review"
    verified = "verified"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


REPORT_STATUS_TRANSITIONS: dict[ReportStatus, list[ReportStatus]] = {
    ReportStatus.submitted: [
        ReportStatus.under_review,
        ReportStatus.closed,
    ],
    ReportStatus.under_review: [
        ReportStatus.verified,
        ReportStatus.closed,
    ],
    ReportStatus.verified: [
        ReportStatus.assigned,
        ReportStatus.in_progress,
        ReportStatus.closed,
    ],
    ReportStatus.assigned: [
        ReportStatus.in_progress,
        ReportStatus.closed,
    ],
    ReportStatus.in_progress: [
        ReportStatus.resolved,
        ReportStatus.closed,
    ],
    ReportStatus.resolved: [ReportStatus.closed],
    ReportStatus.closed: [],
}


class ReportCategory(enum.StrEnum):
    road = "road"
    waste = "waste"
    infrastructure = "infrastructure"
    environment = "environment"
    utility = "utility"


class CaseStatus(enum.StrEnum):
    opened = "opened"
    open = "open"
    in_review = "in_review"
    action_scheduled = "action_scheduled"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


CASE_STATUS_TRANSITIONS: dict[CaseStatus, list[CaseStatus]] = {
    CaseStatus.opened: [CaseStatus.in_review, CaseStatus.closed],
    CaseStatus.open: [CaseStatus.in_review, CaseStatus.closed],
    CaseStatus.in_review: [
        CaseStatus.action_scheduled,
        CaseStatus.in_progress,
        CaseStatus.closed,
    ],
    CaseStatus.action_scheduled: [CaseStatus.in_progress, CaseStatus.closed],
    CaseStatus.in_progress: [CaseStatus.resolved, CaseStatus.closed],
    CaseStatus.resolved: [CaseStatus.closed],
    CaseStatus.closed: [],
}


class NotificationType(enum.StrEnum):
    report_update = "report_update"
    status_change = "status_change"
    mention = "mention"
    case_assigned = "case_assigned"
    moderation_action = "moderation_action"
