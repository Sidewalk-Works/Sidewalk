
import subprocess
import sys

from sqlalchemy import inspect, text

# Keep your existing engine/session setup and safety guard.
# Ensure your database target has been validated before destructive actions.


def reset_database(engine) -> None:
    """Reset database schema and recreate it through Alembic migrations."""

    with engine.begin() as connection:
        # Drop application tables managed by SQLAlchemy metadata.
        Base.metadata.drop_all(bind=connection)

        # Remove Alembic's migration marker if it still exists.
        inspector = inspect(connection)
        if "alembic_version" in inspector.get_table_names():
            connection.execute(text("DROP TABLE alembic_version"))

    # Rebuild schema exclusively through Alembic.
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
    )

    print("Database schema reset and rebuilt through Alembic.")
