import { NotificationPreferenceCenterService } from '../notification-preference-center.service.js';

describe('NotificationPreferenceCenterService', () => {
  let service: NotificationPreferenceCenterService;

  beforeEach(() => { service = new NotificationPreferenceCenterService(); });

  describe('getPreferences', () => {
    it('returns all-true defaults for a new user', () => {
      const payload = service.getPreferences('user-1');
      expect(payload.userId).toBe('user-1');
      expect(payload.preferences.reportStatusChanges.email).toBe(true);
      expect(payload.preferences.neighborhoodAlerts.push).toBe(true);
    });

    it('includes a valid updatedAtIso timestamp', () => {
      const payload = service.getPreferences('user-1');
      expect(() => new Date(payload.updatedAtIso)).not.toThrow();
    });

    it('returns stored preferences after an update', () => {
      service.updatePreferences('user-2', {
        reportStatusChanges: { email: false, push: false, inApp: true },
        moderationActions: { email: false, push: false, inApp: false },
        communityReplies: { email: true, push: false, inApp: true },
        neighborhoodAlerts: { email: false, push: false, inApp: false },
      });
      const payload = service.getPreferences('user-2');
      expect(payload.preferences.reportStatusChanges.email).toBe(false);
    });
  });

  describe('updatePreferences', () => {
    it('persists partial preference changes', () => {
      service.updatePreferences('user-3', {
        reportStatusChanges: { email: true, push: false, inApp: true },
        moderationActions: { email: false, push: false, inApp: false },
        communityReplies: { email: false, push: false, inApp: false },
        neighborhoodAlerts: { email: false, push: false, inApp: false },
      });
      const prefs = service.getPreferences('user-3').preferences;
      expect(prefs.reportStatusChanges.email).toBe(true);
      expect(prefs.moderationActions.email).toBe(false);
    });
  });
});
