import pytest
from sqlalchemy import text

PLAN_PREFIX = "EXPLAIN QUERY PLAN "


async def _plan(db_session, sql: str) -> str:
    rows = (await db_session.execute(text(PLAN_PREFIX + sql))).all()
    return " | ".join(str(row[-1]) for row in rows)


async def test_unread_notifications_use_the_composite_index(db_session):
    plan = await _plan(
        db_session,
        "SELECT * FROM notifications WHERE user_id = 'u' AND read = 0 "
        "ORDER BY created_at DESC LIMIT 20",
    )
    assert "ix_notifications_user_read_created" in plan


@pytest.mark.parametrize(
    ("column", "index"),
    [
        ("status", "ix_reports_deleted_status_created"),
        ("category", "ix_reports_deleted_category_created"),
    ],
)
async def test_report_listing_uses_the_composite_indexes(db_session, column, index):
    plan = await _plan(
        db_session,
        f"SELECT * FROM reports WHERE is_deleted = 0 AND {column} = 'x' "
        "ORDER BY created_at DESC LIMIT 50",
    )
    assert index in plan
