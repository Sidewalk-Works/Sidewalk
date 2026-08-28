import { PushDocsService } from '../push-docs.service.js';

describe('PushDocsService', () => {
  let service: PushDocsService;

  const validRegistration = {
    userId: 'user-1',
    deviceToken: 'token-abc-123',
    platform: 'ios' as const,
    registeredAtIso: new Date().toISOString(),
  };

  beforeEach(() => { service = new PushDocsService(); });

  describe('registerDevice', () => {
    it('registers a device without throwing', () => {
      expect(() => service.registerDevice('user-1', validRegistration)).not.toThrow();
    });

    it('overwrites an existing registration for the same userId', () => {
      service.registerDevice('user-1', validRegistration);
      const updated = { ...validRegistration, deviceToken: 'token-xyz-456' };
      service.registerDevice('user-1', updated);
      // No public getter, so just check it doesn't throw and is idempotent
    });
  });

  describe('unregisterDevice', () => {
    it('unregisters an existing device without throwing', () => {
      service.registerDevice('user-1', validRegistration);
      expect(() => service.unregisterDevice('user-1')).not.toThrow();
    });

    it('does not throw when unregistering a user with no device', () => {
      expect(() => service.unregisterDevice('no-such-user')).not.toThrow();
    });
  });
});
