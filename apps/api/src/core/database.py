from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from src.core.config import get_async_database_url, get_settings


def enable_sqlite_foreign_keys(engine: AsyncEngine) -> None:
    """Turn on FK enforcement for every SQLite connection (SQLite ignores FKs by default)."""

    def _set_pragma(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    event.listen(engine.sync_engine, "connect", _set_pragma)


def build_engine(database_url: str) -> AsyncEngine:
    """Create an engine for ``database_url`` using the pool settings from configuration."""
    settings = get_settings()
    url = get_async_database_url(database_url)
    kwargs: dict[str, object] = {}
    if not url.startswith("sqlite"):
        kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
            pool_pre_ping=True,
        )

    engine_kwargs: dict[str, object] = {
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "pool_recycle": getattr(settings, "DB_POOL_RECYCLE", 1800),
        "pool_pre_ping": True,
    }

    return create_async_engine(
        url,
        echo=settings.DB_ECHO,
        **engine_kwargs,
    )


engine = build_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
