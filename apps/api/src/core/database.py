from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from src.core.config import settings


def build_engine(database_url: str | None = None) -> AsyncEngine:
    url = database_url or settings.DATABASE_URL

    if "sqlite" in url:
        return create_async_engine(
            url,
            echo=settings.DB_ECHO,
            poolclass=NullPool,
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