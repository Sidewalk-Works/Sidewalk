import { NotificationAuditHistoryService } from '../notification-audit-history.service.js';

const makeLog = (id: string, recipientId = 'user-1') => ({
  logId: id,
  recipientId,
  notificationId: `notif-${id}`,
  channel: 'in_app' as const,
  status: 'delivered' as const,
  dispatchedAtIso: new Date().toISOString(),
  metadata: {},
});

describe('NotificationAuditHistoryService', () => {
  let service: NotificationAuditHistoryService;

  beforeEach(() => { service = new NotificationAuditHistoryService(); });

  describe('logDispatch', () => {
    it('records and returns the validated log entry', () => {
      const log = service.logDispatch(makeLog('log-1'));
      expect(log.logId).toBe('log-1');
      expect(log.recipientId).toBe('user-1');
    });

    it('stores multiple entries for the same user', () => {
      service.logDispatch(makeLog('log-1'));
      service.logDispatch(makeLog('log-2'));
      expect(service.getHistoryForUser('user-1')).toHaveLength(2);
    });
  });

  describe('getHistoryForUser', () => {
    it('returns an empty array for a user with no history', () => {
      expect(service.getHistoryForUser('unknown')).toHaveLength(0);
    });

    it('returns only entries for the requested user', () => {
      service.logDispatch(makeLog('log-1', 'user-1'));
      service.logDispatch(makeLog('log-2', 'user-2'));
      service.logDispatch(makeLog('log-3', 'user-1'));
      expect(service.getHistoryForUser('user-1')).toHaveLength(2);
      expect(service.getHistoryForUser('user-2')).toHaveLength(1);
    });

    it('returns entries in insertion order', () => {
      service.logDispatch(makeLog('log-a'));
      service.logDispatch(makeLog('log-b'));
      const history = service.getHistoryForUser('user-1');
      expect(history[0].logId).toBe('log-a');
      expect(history[1].logId).toBe('log-b');
    });
  });
});
