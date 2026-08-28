import { InAppNotificationInboxService } from '../in-app-notification-inbox.service.js';

const makeItem = (id: string, userId = 'user-1') => ({
  notificationId: id,
  recipientUserId: userId,
  title: `Notification ${id}`,
  body: 'Some body text',
  isRead: false,
  createdAtIso: new Date().toISOString(),
  type: 'status_change' as const,
});

describe('InAppNotificationInboxService', () => {
  let service: InAppNotificationInboxService;

  beforeEach(() => { service = new InAppNotificationInboxService(); });

  describe('addNotification', () => {
    it('adds a notification and makes it retrievable', () => {
      service.addNotification(makeItem('n1'));
      expect(service.getInboxItems('user-1')).toHaveLength(1);
    });

    it('prepends new notifications (newest first)', () => {
      service.addNotification(makeItem('n1'));
      service.addNotification(makeItem('n2'));
      const items = service.getInboxItems('user-1');
      expect(items[0].notificationId).toBe('n2');
    });

    it('scopes notifications to the correct userId', () => {
      service.addNotification(makeItem('n1', 'user-1'));
      service.addNotification(makeItem('n2', 'user-2'));
      expect(service.getInboxItems('user-1')).toHaveLength(1);
      expect(service.getInboxItems('user-2')).toHaveLength(1);
    });
  });

  describe('getInboxItems', () => {
    it('returns an empty array for a user with no notifications', () => {
      expect(service.getInboxItems('no-such-user')).toHaveLength(0);
    });

    it('returns validated items', () => {
      service.addNotification(makeItem('n1'));
      const [item] = service.getInboxItems('user-1');
      expect(item).toHaveProperty('notificationId', 'n1');
      expect(item).toHaveProperty('isRead', false);
    });

    // Pagination behaviour — basic: page 1 of 1
    it('returns all items for a small inbox', () => {
      service.addNotification(makeItem('n1'));
      service.addNotification(makeItem('n2'));
      expect(service.getInboxItems('user-1')).toHaveLength(2);
    });
  });
});
