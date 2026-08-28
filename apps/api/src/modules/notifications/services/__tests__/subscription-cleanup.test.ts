import { SubscriptionCleanupService } from '../subscription-cleanup.service.js';

const makeRule = (id: string, trigger: string, action = 'remove_subscription') => ({
  ruleId: id,
  trigger: trigger as any,
  action: action as any,
  enabled: true,
  createdAtIso: new Date().toISOString(),
  lastRunAtIso: null,
  runCount: 0,
});

describe('SubscriptionCleanupService', () => {
  let service: SubscriptionCleanupService;
  beforeEach(() => { service = new SubscriptionCleanupService(); });

  describe('addRule / removeRule / getEnabledRules', () => {
    it('adds and retrieves an enabled rule', () => {
      service.addRule(makeRule('r-1', 'report_closed'));
      expect(service.getEnabledRules()).toHaveLength(1);
    });

    it('removeRule returns true and removes it', () => {
      service.addRule(makeRule('r-1', 'report_closed'));
      expect(service.removeRule('r-1')).toBe(true);
      expect(service.getEnabledRules()).toHaveLength(0);
    });

    it('removeRule returns false for unknown id', () => {
      expect(service.removeRule('no-such-id')).toBe(false);
    });
  });

  describe('getRulesByTrigger', () => {
    it('returns only rules matching the trigger', () => {
      service.addRule(makeRule('r-1', 'report_closed'));
      service.addRule(makeRule('r-2', 'report_merged'));
      expect(service.getRulesByTrigger('report_closed')).toHaveLength(1);
    });
  });

  describe('cleanupOnReportClosed', () => {
    it('returns a result with trigger report_closed', async () => {
      service.addRule(makeRule('r-1', 'report_closed'));
      const result = await service.cleanupOnReportClosed('report-1');
      expect(result.trigger).toBe('report_closed');
      expect(result.executedAtIso).toBeTruthy();
    });

    it('increments removedCount for remove_subscription rules', async () => {
      service.addRule(makeRule('r-1', 'report_closed', 'remove_subscription'));
      const result = await service.cleanupOnReportClosed('report-1');
      expect(result.removedCount).toBe(1);
    });
  });

  describe('manualCleanup', () => {
    it('runs with trigger manual', async () => {
      service.addRule(makeRule('r-1', 'manual'));
      const result = await service.manualCleanup('report-1');
      expect(result.trigger).toBe('manual');
    });
  });

  describe('batchCleanup', () => {
    it('returns one result per reportId', async () => {
      service.addRule(makeRule('r-1', 'report_archived'));
      const results = await service.batchCleanup(['r-a', 'r-b', 'r-c'], 'report_archived');
      expect(results).toHaveLength(3);
    });
  });

  describe('getResults', () => {
    it('accumulates results across multiple cleanup calls', async () => {
      service.addRule(makeRule('r-1', 'report_closed'));
      await service.cleanupOnReportClosed('report-1');
      await service.cleanupOnReportClosed('report-2');
      expect(service.getResults()).toHaveLength(2);
    });
  });
});
