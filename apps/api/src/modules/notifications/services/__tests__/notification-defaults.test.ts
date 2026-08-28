import { NotificationDefaultsService } from '../notification-defaults.service.js';

describe('NotificationDefaultsService', () => {
  let service: NotificationDefaultsService;

  beforeEach(() => { service = new NotificationDefaultsService(); });

  describe('provideDefaultsForUser', () => {
    it('returns a profile with inApp=true, email/push=false by default', () => {
      const profile = service.provideDefaultsForUser('user-1');
      expect(profile.userId).toBe('user-1');
      expect(profile.defaults.inApp).toBe(true);
      expect(profile.defaults.email).toBe(false);
      expect(profile.defaults.push).toBe(false);
      expect(profile.isOptInModel).toBe(true);
    });

    it('returns the same cached profile on repeated calls', () => {
      const first = service.provideDefaultsForUser('user-1');
      const second = service.provideDefaultsForUser('user-1');
      expect(second.appliedAtIso).toBe(first.appliedAtIso);
    });
  });

  describe('provideDefaultsForAnonymous', () => {
    it('returns anonymous defaults with a sessionId', () => {
      const anon = service.provideDefaultsForAnonymous('sess-1');
      expect(anon.sessionId).toBe('sess-1');
      expect(anon.defaults.inApp).toBe(true);
    });

    it('returns the same session on repeated calls', () => {
      const first = service.provideDefaultsForAnonymous('sess-1');
      const second = service.provideDefaultsForAnonymous('sess-1');
      expect(second.assignedAtIso).toBe(first.assignedAtIso);
    });
  });

  describe('optInUser / optOutUser', () => {
    it('optIn sets a channel to true', () => {
      const profile = service.optInUser('user-1', 'email');
      expect(profile.defaults.email).toBe(true);
    });

    it('optOut sets a channel to false', () => {
      service.optInUser('user-1', 'push');
      const profile = service.optOutUser('user-1', 'push');
      expect(profile.defaults.push).toBe(false);
    });

    it('optIn on a new user implicitly creates the profile first', () => {
      const profile = service.optInUser('new-user', 'email');
      expect(profile.userId).toBe('new-user');
      expect(profile.defaults.email).toBe(true);
    });
  });

  describe('getDefaults', () => {
    it('returns defaults for an existing user', () => {
      service.optInUser('user-1', 'email');
      const defaults = service.getDefaults('user-1');
      expect(defaults.email).toBe(true);
    });

    it('returns fallback defaults for an unknown user', () => {
      const defaults = service.getDefaults('unknown');
      expect(defaults.inApp).toBe(true);
      expect(defaults.email).toBe(false);
    });
  });
});
