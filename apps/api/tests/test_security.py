import pytest

from reset_db import get_database_target, require_confirmation


def test_security_auth():
    """Non-SQLite database resets must require explicit confirmation."""
    target = get_database_target("postgresql://user:password@staging-db:5432/sidewalk")

    assert target["requires_confirmation"] is True

    with pytest.raises(SystemExit):
        require_confirmation(target, confirmed=False)


def test_security_auth_allows_explicit_confirmation():
    """Explicit confirmation allows the guarded reset to proceed."""
    target = get_database_target("postgresql://user:password@staging-db:5432/sidewalk")

    require_confirmation(target, confirmed=True)


def test_security_auth_allows_sqlite_without_confirmation():
    """SQLite reset does not require the non-SQLite confirmation flag."""
    target = get_database_target("sqlite:///./test.db")

    assert target["requires_confirmation"] is False

    require_confirmation(target, confirmed=False)
