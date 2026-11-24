import uuid

import pytest

from src.core.enums import NotificationType
from src.core.exceptions import NotFoundError
from src.modules.auth.repository import create_user
from src.modules.notifications import service as notif_service


async def test_create_notification(db_session):
    user = await create_user(db_session, "notif_user1@example.com", "hash")
    notif = await notif_service.create_notification(
        db_session,
        user.id,
        NotificationType.report_update,
        {"report_id": str(uuid.uuid4())},
    )
    assert notif.id is not None
    assert notif.user_id == user.id
    assert notif.type == NotificationType.report_update
    assert notif.read is False


async def test_list_notifications_for_user(db_session):
    user = await create_user(db_session, "notif_user2@example.com", "hash")
    other_user = await create_user(db_session, "notif_user2_other@example.com", "hash")

    await notif_service.create_notification(db_session, user.id, NotificationType.status_change)
    await notif_service.create_notification(db_session, user.id, NotificationType.mention)
    await notif_service.create_notification(db_session, other_user.id, NotificationType.mention)

    items, total = await notif_service.list_notifications(db_session, user.id)
    assert total == 2
    assert len(items) == 2
    assert all(item.user_id == user.id for item in items)


async def test_list_notifications_unread_only(db_session):
    user = await create_user(db_session, "notif_user3@example.com", "hash")
    n1 = await notif_service.create_notification(
        db_session, user.id, NotificationType.report_update
    )
    n2 = await notif_service.create_notification(
        db_session, user.id, NotificationType.case_assigned
    )

    await notif_service.mark_read(db_session, n1.id, user.id)

    items, total = await notif_service.list_notifications(db_session, user.id, unread_only=True)
    assert total == 1
    assert len(items) == 1
    assert items[0].id == n2.id


async def test_mark_notification_read(db_session):
    user = await create_user(db_session, "notif_user4@example.com", "hash")
    notif = await notif_service.create_notification(db_session, user.id, NotificationType.mention)
    assert notif.read is False

    updated = await notif_service.mark_read(db_session, notif.id, user.id)
    assert updated.read is True


async def test_mark_other_users_notification_raises_not_found(db_session):
    """#1149: another user's notification must be indistinguishable from a missing one.

    A 403 here would confirm that the id exists, letting a caller probe UUIDs.
    """
    user1 = await create_user(db_session, "notif_user5_1@example.com", "hash")
    user2 = await create_user(db_session, "notif_user5_2@example.com", "hash")
    notif = await notif_service.create_notification(db_session, user1.id, NotificationType.mention)

    with pytest.raises(NotFoundError):
        await notif_service.mark_read(db_session, notif.id, user2.id)


async def test_mark_read_missing_id_raises_not_found(db_session):
    user = await create_user(db_session, "notif_user5_3@example.com", "hash")

    with pytest.raises(NotFoundError):
        await notif_service.mark_read(db_session, uuid.uuid4(), user.id)


async def test_mark_read_other_user_leaves_notification_unread(db_session):
    """The owner's notification must not be mutated by another user's attempt."""
    owner = await create_user(db_session, "notif_user5_4@example.com", "hash")
    intruder = await create_user(db_session, "notif_user5_5@example.com", "hash")
    notif = await notif_service.create_notification(db_session, owner.id, NotificationType.mention)

    with pytest.raises(NotFoundError):
        await notif_service.mark_read(db_session, notif.id, intruder.id)

    items, _ = await notif_service.list_notifications(db_session, owner.id)
    assert items[0].read is False


async def test_mark_read_is_scoped_to_the_owner(db_session):
    """Two users holding notifications: each id is only readable by its owner."""
    user1 = await create_user(db_session, "notif_user5_6@example.com", "hash")
    user2 = await create_user(db_session, "notif_user5_7@example.com", "hash")
    notif1 = await notif_service.create_notification(db_session, user1.id, NotificationType.mention)
    notif2 = await notif_service.create_notification(db_session, user2.id, NotificationType.mention)

    assert (await notif_service.mark_read(db_session, notif1.id, user1.id)).read is True
    assert (await notif_service.mark_read(db_session, notif2.id, user2.id)).read is True

    with pytest.raises(NotFoundError):
        await notif_service.mark_read(db_session, notif1.id, user2.id)


async def test_mark_all_read_returns_count(db_session):
    user = await create_user(db_session, "notif_user6@example.com", "hash")
    await notif_service.create_notification(db_session, user.id, NotificationType.report_update)
    await notif_service.create_notification(db_session, user.id, NotificationType.status_change)
    await notif_service.create_notification(db_session, user.id, NotificationType.mention)

    count = await notif_service.mark_all_read(db_session, user.id)
    assert count == 3

    # Calling again returns 0
    count_second = await notif_service.mark_all_read(db_session, user.id)
    assert count_second == 0


async def test_count_unread(db_session):
    user = await create_user(db_session, "notif_user7@example.com", "hash")
    assert await notif_service.count_unread(db_session, user.id) == 0

    n1 = await notif_service.create_notification(
        db_session, user.id, NotificationType.report_update
    )
    n2 = await notif_service.create_notification(
        db_session, user.id, NotificationType.status_change
    )
    assert await notif_service.count_unread(db_session, user.id) == 2

    await notif_service.mark_read(db_session, n1.id, user.id)
    assert await notif_service.count_unread(db_session, user.id) == 1

    await notif_service.mark_read(db_session, n2.id, user.id)
    assert await notif_service.count_unread(db_session, user.id) == 0
