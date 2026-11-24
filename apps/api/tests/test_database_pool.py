from unittest.mock import patch

from sqlalchemy.pool import QueuePool

from src.core.config import settings
from src.core.database import build_engine


def test_build_engine_passes_db_pool_timeout() -> None:
    custom_timeout = 42

    with patch.object(settings, "DB_POOL_TIMEOUT", custom_timeout):
        test_engine = build_engine("postgresql+asyncpg://user:pass@localhost:5432/sidewalk")

    try:
        pool = test_engine.sync_engine.pool
        assert isinstance(pool, QueuePool)
        assert pool._timeout == custom_timeout
    finally:
        test_engine.sync_engine.dispose()