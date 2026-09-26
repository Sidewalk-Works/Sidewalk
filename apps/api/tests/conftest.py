import asyncio
from collections.abc import AsyncGenerator
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from src.core.database import get_db
from src.core.models import Base
from src.main import create_app
import src.models  # noqa: F401

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def reset_limiter():
    from src.core.limiter import limiter
    limiter.reset()
    yield
    limiter.reset()



@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture
def app(test_engine):
    application = create_app()
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with async_session() as session:
            try:
                yield session
            finally:
                await session.close()

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
