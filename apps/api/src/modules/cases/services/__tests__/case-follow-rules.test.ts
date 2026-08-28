import { caseFollowRulesService } from '../case-follow-rules.service.js';

// Mock prisma to avoid a real DB connection in unit tests
jest.mock('../../../shared/database/prisma.js', () => ({
  prisma: {
    caseFollowRule: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../../shared/database/prisma.js';

const mockPrisma = prisma.caseFollowRule as jest.Mocked<typeof prisma.caseFollowRule>;

const baseRow = {
  id: 'rule-1',
  caseId: 'case-1',
  userId: 'user-1',
  triggerCondition: 'case_created',
  onNewComment: true,
  onStatusChange: true,
  onAssignment: true,
  onMention: true,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

beforeEach(() => jest.clearAllMocks());

describe('caseFollowRulesService', () => {
  describe('addRule', () => {
    it('upserts a follow rule and returns a CaseFollowRule', async () => {
      mockPrisma.upsert.mockResolvedValue(baseRow as any);
      const result = await caseFollowRulesService.addRule('case-1', 'user-1', 'case_created');
      expect(result.ruleId).toBe('rule-1');
      expect(result.triggerCondition).toBe('case_created');
      expect(result.isActive).toBe(true);
      expect(mockPrisma.upsert).toHaveBeenCalledTimes(1);
    });

    it('respects custom notificationConfig overrides', async () => {
      mockPrisma.upsert.mockResolvedValue({ ...baseRow, onNewComment: false } as any);
      const result = await caseFollowRulesService.addRule('case-1', 'user-1', 'new_comment', { onNewComment: false });
      expect(result.notificationConfig.onNewComment).toBe(false);
    });
  });

  describe('autoFollowOnCreation', () => {
    it('calls addRule with trigger case_created', async () => {
      mockPrisma.upsert.mockResolvedValue(baseRow as any);
      await caseFollowRulesService.autoFollowOnCreation('case-1', 'user-1');
      expect(mockPrisma.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ triggerCondition: 'case_created' }) }),
      );
    });
  });

  describe('unfollow', () => {
    it('returns true when at least one rule was deactivated', async () => {
      mockPrisma.updateMany.mockResolvedValue({ count: 1 } as any);
      const result = await caseFollowRulesService.unfollow('case-1', 'user-1');
      expect(result).toBe(true);
    });

    it('returns false when no active rules exist', async () => {
      mockPrisma.updateMany.mockResolvedValue({ count: 0 } as any);
      const result = await caseFollowRulesService.unfollow('case-1', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('getRulesForCase', () => {
    it('returns active rules mapped to CaseFollowRule', async () => {
      mockPrisma.findMany.mockResolvedValue([baseRow] as any);
      const rules = await caseFollowRulesService.getRulesForCase('case-1');
      expect(rules).toHaveLength(1);
      expect(rules[0].caseId).toBe('case-1');
    });
  });

  describe('getRulesForUser', () => {
    it('returns all active rules for a user', async () => {
      mockPrisma.findMany.mockResolvedValue([baseRow] as any);
      const rules = await caseFollowRulesService.getRulesForUser('user-1');
      expect(rules[0].userId).toBe('user-1');
    });
  });

  describe('isFollowing', () => {
    it('returns true when an active rule exists', async () => {
      mockPrisma.findUnique.mockResolvedValue(baseRow as any);
      expect(await caseFollowRulesService.isFollowing('case-1', 'user-1')).toBe(true);
    });

    it('returns false when no rule exists', async () => {
      mockPrisma.findUnique.mockResolvedValue(null as any);
      expect(await caseFollowRulesService.isFollowing('case-1', 'user-1')).toBe(false);
    });

    it('returns false when rule is inactive', async () => {
      mockPrisma.findUnique.mockResolvedValue({ ...baseRow, isActive: false } as any);
      expect(await caseFollowRulesService.isFollowing('case-1', 'user-1')).toBe(false);
    });
  });

  describe('getNotificationRecipients', () => {
    it('returns a list of userIds', async () => {
      mockPrisma.findMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }] as any);
      const recipients = await caseFollowRulesService.getNotificationRecipients('case-1', 'new_comment');
      expect(recipients).toEqual(['user-1', 'user-2']);
    });
  });

  describe('updateNotificationConfig', () => {
    it('returns null when no active rule found', async () => {
      mockPrisma.findUnique.mockResolvedValue(null as any);
      const result = await caseFollowRulesService.updateNotificationConfig('case-1', 'user-1', { onMention: false });
      expect(result).toBeNull();
    });

    it('returns updated rule when found', async () => {
      mockPrisma.findUnique.mockResolvedValue(baseRow as any);
      const updated = { ...baseRow, onMention: false };
      mockPrisma.update.mockResolvedValue(updated as any);
      const result = await caseFollowRulesService.updateNotificationConfig('case-1', 'user-1', { onMention: false });
      expect(result?.notificationConfig.onMention).toBe(false);
    });
  });
});
