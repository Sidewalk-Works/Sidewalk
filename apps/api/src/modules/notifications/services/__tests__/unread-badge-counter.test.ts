import { UnreadBadgeCounterService } from '../unread-badge-counter.service.js';

describe('UnreadBadgeCounterService', () => {
  let service: UnreadBadgeCounterService;
  beforeEach(() => { service = new UnreadBadgeCounterService(); });

  describe('getUnreadBadgeState', () => {
    it('returns a badge state with numeric counts', () => {
      const state = service.getUnreadBadgeState('user-1');
      expect(typeof state.totalUnread).toBe('number');
      expect(typeof state.caseUpdatesUnread).toBe('number');
    });

    it('returns hasUrgentUnread as a boolean', () => {
      const state = service.getUnreadBadgeState('user-1');
      expect(typeof state.hasUrgentUnread).toBe('boolean');
    });
  });

  describe('markAllRead', () => {
    it('sets all counts to 0', () => {
      const state = service.markAllRead('user-1');
      expect(state.totalUnread).toBe(0);
      expect(state.caseUpdatesUnread).toBe(0);
      expect(state.moderationUnread).toBe(0);
      expect(state.directRepliesUnread).toBe(0);
    });

    it('sets hasUrgentUnread to false', () => {
      const state = service.markAllRead('user-1');
      expect(state.hasUrgentUnread).toBe(false);
    });

    it('subsequent getUnreadBadgeState reflects the cleared state', () => {
      service.markAllRead('user-1');
      const state = service.getUnreadBadgeState('user-1');
      expect(state.totalUnread).toBe(0);
    });
  });
});
