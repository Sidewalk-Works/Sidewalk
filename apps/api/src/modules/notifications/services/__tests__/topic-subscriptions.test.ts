import { TopicSubscriptionsService } from '../topic-subscriptions.service.js';

describe('TopicSubscriptionsService', () => {
  let service: TopicSubscriptionsService;
  beforeEach(() => { service = new TopicSubscriptionsService(); });

  const params = { userId: 'user-1', topicId: 'topic-1', category: 'infrastructure' as const, label: 'Roads' };

  describe('subscribe', () => {
    it('returns a subscription with a generated id', () => {
      const sub = service.subscribe(params);
      expect(sub.id).toBeTruthy();
      expect(sub.userId).toBe('user-1');
    });

    it('defaults frequency to realtime', () => {
      const sub = service.subscribe(params);
      expect(sub.frequency).toBe('realtime');
    });

    it('respects a custom frequency', () => {
      const sub = service.subscribe({ ...params, frequency: 'daily' });
      expect(sub.frequency).toBe('daily');
    });
  });

  describe('unsubscribe', () => {
    it('returns true for an existing subscription', () => {
      const sub = service.subscribe(params);
      expect(service.unsubscribe(sub.id)).toBe(true);
    });

    it('returns false for a non-existent id (idempotent)', () => {
      expect(service.unsubscribe('no-such-id')).toBe(false);
    });

    it('makes the subscription no longer retrievable', () => {
      const sub = service.subscribe(params);
      service.unsubscribe(sub.id);
      expect(service.getByUser('user-1')).toHaveLength(0);
    });
  });

  describe('getByUser', () => {
    it('returns only subscriptions for the given user', () => {
      service.subscribe(params);
      service.subscribe({ ...params, userId: 'user-2' });
      expect(service.getByUser('user-1')).toHaveLength(1);
    });
  });

  describe('getByCategory', () => {
    it('filters by category', () => {
      service.subscribe(params);
      service.subscribe({ ...params, category: 'water' });
      expect(service.getByCategory('user-1', 'infrastructure')).toHaveLength(1);
    });
  });
});
