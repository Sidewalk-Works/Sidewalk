from collections.abc import AsyncGenerator
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.config import get_async_database_url, get_settings


def enable_sqlite_foreign_keys(engine: AsyncEngine) -> None:
    """Turn on FK enforcement for every SQLite connection (SQLite ignores FKs by default)."""

    def _set_pragma(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    event.listen(engine.sync_engine, "connect", _set_pragma)


def build_engine(database_url: str | None = None) -> AsyncEngine:
    """Create an engine for ``database_url`` using the pool settings from configuration."""
    settings = get_settings()
    url = get_async_database_url(database_url or settings.DATABASE_URL)
    kwargs: dict[str, object] = {}
    if not url.startswith("sqlite"):
        kwargs.update(
            pool_size=getattr(settings, "DB_POOL_SIZE", 10),
            max_overflow=getattr(settings, "DB_MAX_OVERFLOW", 20),
            pool_timeout=getattr(settings, "DB_POOL_TIMEOUT", 30),
            pool_recycle=getattr(settings, "DB_POOL_RECYCLE_SECONDS", 1800),
            pool_pre_ping=True,
        )

    engine = create_async_engine(
        url,
        echo=getattr(settings, "DB_ECHO", False),
        **kwargs,
    )
    if url.startswith("sqlite"):
        enable_sqlite_foreign_keys(engine)
    return engine


@lru_cache
def get_engine() -> AsyncEngine:
    """The application engine, created on first use rather than at import time."""
    return build_engine(get_settings().DATABASE_URL)


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    One transaction per request: commit when the request succeeds, roll back on any
    error. Repositories and services only ``flush``; this is the single commit point.
    """
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DBSession = Annotated[AsyncSession, Depends(get_db)]

__all__ = [
    "DBSession",
    "build_engine",
    "enable_sqlite_foreign_keys",
    "get_db",
    "get_engine",
    "get_session_factory",
]
