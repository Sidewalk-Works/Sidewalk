import logging
import os

import structlog


def configure_logging(log_level: str = "INFO", environment: str | None = None) -> None:
    """
    Configure structlog for the application.

    Uses JSON output in production and colored console output in development.
    The log level is controlled by ``log_level`` (typically ``settings.LOG_LEVEL``).
    """
    if environment is None:
        environment = os.getenv("ENVIRONMENT", "development")

    level = logging.getLevelNamesMapping().get(log_level.upper(), logging.INFO)

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if environment == "production":
        renderer: structlog.typing.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
