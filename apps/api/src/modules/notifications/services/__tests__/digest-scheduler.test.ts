import { DigestSchedulerService } from '../digest-scheduler.service.js';

const makeNotifications = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n-${i}`, title: `Notif ${i}`, body: 'Body text here', type: 'status_change' }));

describe('DigestSchedulerService', () => {
  let service: DigestSchedulerService;
  beforeEach(() => { service = new DigestSchedulerService(); });

  it('returns null for frequency "none"', () => {
    expect(service.generateDigest('user-1', 'none', makeNotifications(3))).toBeNull();
  });

  it('returns null when notifications array is empty', () => {
    expect(service.generateDigest('user-1', 'daily', [])).toBeNull();
  });

  it('returns a DigestPayload for daily frequency with items', () => {
    const result = service.generateDigest('user-1', 'daily', makeNotifications(3));
    expect(result).not.toBeNull();
    expect(result!.frequency).toBe('daily');
    expect(result!.recipientId).toBe('user-1');
  });

  it('caps items at 5 regardless of input length', () => {
    const result = service.generateDigest('user-1', 'weekly', makeNotifications(10));
    expect(result!.items).toHaveLength(5);
  });

  it('sets totalUnreadCount to the full notification count (not capped)', () => {
    const result = service.generateDigest('user-1', 'weekly', makeNotifications(10));
    expect(result!.totalUnreadCount).toBe(10);
  });

  it('sets a valid generatedAtIso timestamp', () => {
    const result = service.generateDigest('user-1', 'weekly', makeNotifications(1));
    expect(() => new Date(result!.generatedAtIso)).not.toThrow();
  });

  it('works for weekly frequency', () => {
    const result = service.generateDigest('user-1', 'weekly', makeNotifications(2));
    expect(result!.frequency).toBe('weekly');
  });
});
