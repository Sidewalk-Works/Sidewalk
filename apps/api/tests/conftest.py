import asyncio
import os
from collections.abc import AsyncGenerator, Generator

import bcrypt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

import src.models  # noqa: F401
from src.core import security
from src.core.database import enable_sqlite_foreign_keys, get_db
from src.core.models import Base
from src.main import create_app

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")


@pytest.fixture(autouse=True, scope="session")
def fast_bcrypt_for_tests() -> Generator[None, None, None]:
    """Use minimum bcrypt work factor (rounds=4) during tests while keeping production unchanged."""
    original_gensalt = bcrypt.gensalt

    def _fast_gensalt(rounds: int = 4, prefix: bytes = b"2b") -> bytes:
        return original_gensalt(rounds=4, prefix=prefix)

    mp = pytest.MonkeyPatch()
    mp.setattr(bcrypt, "gensalt", _fast_gensalt)

    if hasattr(security, "BCRYPT_ROUNDS"):
        mp.setattr(security, "BCRYPT_ROUNDS", 4)

    yield
    mp.undo()


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def reset_limiter() -> Generator[None, None, None]:
    from src.core.limiter import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(scope="session")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    is_sqlite = TEST_DATABASE_URL.startswith("sqlite")
    engine_kwargs: dict[str, object] = {"echo": False}
    if is_sqlite:
        engine_kwargs["poolclass"] = StaticPool
        engine_kwargs["connect_args"] = {"check_same_thread": False}

    engine = create_async_engine(TEST_DATABASE_URL, **engine_kwargs)
    if is_sqlite:
        enable_sqlite_foreign_keys(engine)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture
def app(test_engine: AsyncEngine) -> FastAPI:
    application = create_app()
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_client(client: AsyncClient, db_session: AsyncSession) -> AsyncClient:
    import uuid

    user_data = {"email": f"auth_{uuid.uuid4().hex[:6]}@test.com", "password": "testpassword123"}
    await client.post("/api/auth/register", json=user_data)
    response = await client.post("/api/auth/login", json=user_data)
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
async def admin_auth_client(client: AsyncClient, db_session: AsyncSession) -> AsyncClient:
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
