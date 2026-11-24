from sqlalchemy import event


async def test_get_me_issues_a_single_user_query(auth_client, test_engine):
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    try:
        res = await auth_client.get("/api/auth/me")
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", record)

    assert res.status_code == 200
    selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
    assert len(selects) == 1, selects
    assert "FROM users" in selects[0]
    assert not any("FROM reports" in s for s in statements)
