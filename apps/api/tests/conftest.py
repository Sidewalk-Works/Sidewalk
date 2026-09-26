import asyncio
from collections.abc import AsyncGenerator
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
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
    # sqlite+aiosqlite:///:memory: gives each new pooled connection its own
    # separate in-memory database by default, so a connection opened later
    # (e.g. by a fixture's own AsyncSession) would see none of the tables
    # created here. StaticPool forces every checkout to reuse the single
    # connection this engine opened, so they all share the same database.
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
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


@pytest.fixture
async def auth_client(client, db_session):
    import uuid
    user_data = {"email": f"auth_{uuid.uuid4().hex[:6]}@test.com", "password": "testpassword123"}
    await client.post("/api/auth/register", json=user_data)
    response = await client.post("/api/auth/login", json=user_data)
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
async def admin_auth_client(client, db_session):
    import uuid
    from sqlalchemy import select
    from src.modules.auth.models import User

    user_data = {"email": f"admin_{uuid.uuid4().hex[:6]}@test.com", "password": "testpassword123"}
    reg_res = await client.post("/api/auth/register", json=user_data)
    user_id = uuid.UUID(reg_res.json()["user"]["id"])
    stmt = select(User).where(User.id == user_id)
    res = await db_session.execute(stmt)
    user = res.scalar_one()
    user.is_admin = True
    await db_session.commit()

    response = await client.post("/api/auth/login", json=user_data)
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client

