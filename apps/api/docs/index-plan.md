# Verifying the list-query indexes

Migration `006_add_composite_indexes` adds:

| Index | Table | Serves |
| --- | --- | --- |
| `ix_notifications_user_read_created` | `notifications` | `GET /notifications` (per-user, optionally unread, newest first) |
| `ix_reports_deleted_status_created` | `reports` | `GET /reports?status=...` |
| `ix_reports_deleted_category_created` | `reports` | `GET /reports?category=...` |

`tests/unit/test_list_query_indexes.py` asserts the planner picks them on SQLite. On
PostgreSQL, with realistic row counts, check the plan after migrating:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM notifications
WHERE user_id = '<uuid>' AND read = false
ORDER BY created_at DESC LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM reports
WHERE is_deleted = false AND status = 'submitted'
ORDER BY created_at DESC LIMIT 50;
```

Both should show an `Index Scan` (or `Index Scan Backward`) on the new index with no `Sort` node.
