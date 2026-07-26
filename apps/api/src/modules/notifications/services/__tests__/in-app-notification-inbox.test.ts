import { describe, it, expect, beforeEach } from 'vitest';
import {
  inAppNotificationItemSchema,
  type InAppNotificationItem,
} from '@sidewalk/shared';
import { InAppNotificationInboxService } from '../in-app-notification-inbox.service';

function makeNotification(overrides: Partial<InAppNotificationItem> = {}): InAppNotificationItem {
  return inAppNotificationItemSchema.parse({
    id: `notif-${Math.random().toString(36).slice(2, 8)}`,
    recipientUserId: 'user-1',
    category: 'status_change',
    title: 'Report updated',
    body: 'Your report was marked as resolved.',
    isRead: false,
    createdAtIso: new Date().toISOString(),
    ...overrides,
  });
}

describe('InAppNotificationInboxService', () => {
  let service: InAppNotificationInboxService;

  beforeEach(() => {
    service = new InAppNotificationInboxService();
  });

  describe('getInboxItems', () => {
    it('returns empty array for user with no notifications', () => {
      expect(service.getInboxItems('user-new')).toEqual([]);
    });

    it('returns notifications added for the given user', () => {
      const item = makeNotification({ recipientUserId: 'user-1' });
      service.addNotification(item);

      const inbox = service.getInboxItems('user-1');
      expect(inbox).toHaveLength(1);
      expect(inbox[0].id).toBe(item.id);
    });

    it('returns only notifications for the requested user', () => {
      service.addNotification(makeNotification({ recipientUserId: 'user-1', id: 'n1' }));
      service.addNotification(makeNotification({ recipientUserId: 'user-2', id: 'n2' }));
      service.addNotification(makeNotification({ recipientUserId: 'user-1', id: 'n3' }));

      const user1Inbox = service.getInboxItems('user-1');
      const user2Inbox = service.getInboxItems('user-2');

      expect(user1Inbox).toHaveLength(2);
      expect(user2Inbox).toHaveLength(1);
      expect(user1Inbox.map((n) => n.id)).toEqual(['n3', 'n1']);
    });
  });

  describe('addNotification', () => {
    it('prepends new notifications to the front of the inbox', () => {
      service.addNotification(makeNotification({ id: 'first' }));
      service.addNotification(makeNotification({ id: 'second' }));

      const inbox = service.getInboxItems('user-1');
      expect(inbox[0].id).toBe('second');
      expect(inbox[1].id).toBe('first');
    });

    it('validates the notification item through the Zod schema', () => {
      expect(() => {
        service.addNotification({
          id: '',
          recipientUserId: 'user-1',
          category: 'status_change',
          title: 'Test',
          body: 'Body',
          isRead: false,
          createdAtIso: 'not-a-date',
        } as unknown as InAppNotificationItem);
      }).toThrow();
    });
  });

  describe('mark as read behavior', () => {
    it('newly added notifications default to isRead: false', () => {
      const item = makeNotification();
      service.addNotification(item);

      const inbox = service.getInboxItems('user-1');
      expect(inbox[0].isRead).toBe(false);
    });

    it('preserves isRead: true when added with that state', () => {
      const item = makeNotification({ isRead: true });
      service.addNotification(item);

      const inbox = service.getInboxItems('user-1');
      expect(inbox[0].isRead).toBe(true);
    });
  });

  describe('pagination and limits', () => {
    it('returns all items when no limit is applied', () => {
      for (let i = 0; i < 5; i++) {
        service.addNotification(makeNotification({ id: `n-${i}` }));
      }

      const inbox = service.getInboxItems('user-1');
      expect(inbox).toHaveLength(5);
    });

    it('supports filtering by category', () => {
      service.addNotification(makeNotification({ id: 'sc1', category: 'status_change' }));
      service.addNotification(makeNotification({ id: 'cr1', category: 'comment_reply' }));
      service.addNotification(makeNotification({ id: 'sc2', category: 'status_change' }));

      const inbox = service.getInboxItems('user-1');
      const statusChanges = inbox.filter((n) => n.category === 'status_change');
      expect(statusChanges).toHaveLength(2);
    });
  });

  describe('empty state', () => {
    it('inbox for unknown user returns empty without errors', () => {
      expect(service.getInboxItems('nonexistent')).toEqual([]);
    });

    it('handles rapid add/get cycles without corruption', () => {
      for (let i = 0; i < 20; i++) {
        service.addNotification(makeNotification({ id: `rapid-${i}` }));
      }
      expect(service.getInboxItems('user-1')).toHaveLength(20);
    });
  });
});
