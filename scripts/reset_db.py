import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
api_dir = root_dir / "apps" / "api"
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from sqlalchemy.ext.asyncio import create_async_engine
from src.core.config import get_settings
from src.core.models import Base
import src.models  # noqa: F401
from scripts.seed import seed


async def reset_database(confirm: bool = False) -> None:
    settings = get_settings()

    if settings.ENVIRONMENT != "development" and not confirm:
        print(
            f"ERROR: Cannot reset database in environment '{settings.ENVIRONMENT}' without --confirm flag.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Resetting database ({settings.ENVIRONMENT})...")

    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

    cmd = ["alembic", "upgrade", "head"]
    result = subprocess.run(cmd, cwd=str(api_dir), capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Alembic upgrade failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(result.returncode)

    await seed()
    print("Database reset complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset and seed local database")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm database reset in non-development environments",
    )
    args = parser.parse_args()

    asyncio.run(reset_database(confirm=args.confirm))
