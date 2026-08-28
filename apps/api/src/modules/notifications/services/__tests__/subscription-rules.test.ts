import { SubscriptionRulesService } from '../subscription-rules.service.js';

const payload = { userId: 'user-1', scope: 'case' as const, topicId: 'case-1', channels: ['in_app'] as const[] };

describe('SubscriptionRulesService', () => {
  let service: SubscriptionRulesService;

  beforeEach(() => { service = new SubscriptionRulesService(); });

  describe('addRule', () => {
    it('creates a rule with an auto-generated id', () => {
      const rule = service.addRule(payload);
      expect(rule.id).toBeTruthy();
      expect(rule.userId).toBe('user-1');
      expect(rule.scope).toBe('case');
    });

    it('timestamps the rule at creation', () => {
      const rule = service.addRule(payload);
      expect(() => new Date(rule.createdAtIso)).not.toThrow();
      expect(() => new Date(rule.updatedAtIso)).not.toThrow();
    });
  });

  describe('getRules', () => {
    it('returns an empty array for a user with no rules', () => {
      expect(service.getRules('user-1')).toHaveLength(0);
    });

    it('returns rules for the correct user', () => {
      service.addRule(payload);
      service.addRule({ ...payload, userId: 'user-2' });
      expect(service.getRules('user-1')).toHaveLength(1);
    });
  });

  describe('removeRule', () => {
    it('returns true after removing an existing rule', () => {
      const rule = service.addRule(payload);
      expect(service.removeRule('user-1', rule.id)).toBe(true);
      expect(service.getRules('user-1')).toHaveLength(0);
    });

    it('returns false for a non-existent rule', () => {
      expect(service.removeRule('user-1', 'no-such-id')).toBe(false);
    });
  });

  describe('updateRuleScope', () => {
    it('returns updated rule with new scope', () => {
      const rule = service.addRule(payload);
      const updated = service.updateRuleScope('user-1', rule.id, 'topic');
      expect(updated?.scope).toBe('topic');
    });

    it('returns null for a non-existent rule', () => {
      expect(service.updateRuleScope('user-1', 'missing', 'topic')).toBeNull();
    });
  });
});
