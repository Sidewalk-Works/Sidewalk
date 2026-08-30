/**
 * Request-level tests for case-follow-rules.controller.ts
 *
 * Tests the contract and shape of each route handler exposed by the
 * case-follow-rules controller. Uses in-memory mocks so no DB or
 * HTTP server is required.
 *
 * Covers: follow, unfollow, getFollowers, getFollowStatus, getFollowedReports
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup ───────────────────────────────────────────────────────────────

const mockReport = {
  id: "report-abc-123",
  authorId: "user-1",
  title: "Pothole on Main St",
  description: "Large pothole",
  status: "open",
  visibility: "public",
  location: null,
  createdAt: new Date("2026-08-01"),
};

const mockRule = {
  caseId: "report-abc-123",
  userId: "user-1",
  triggerCondition: "case_created",
  notificationConfig: null,
  createdAtIso: "2026-08-30T10:00:00.000Z",
};

vi.mock("../../../../shared/database/prisma.js", () => ({
  prisma: {
    report: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../cases/services/case-follow-rules.service.js", () => ({
  caseFollowRulesService: {
    addRule: vi.fn(),
    unfollow: vi.fn(),
    getRulesForCase: vi.fn(),
    isFollowing: vi.fn(),
    getRulesForUser: vi.fn(),
    autoFollowOnCreation: vi.fn(),
    autoFollowOnStatusChange: vi.fn(),
  },
}));

import { caseFollowRulesController } from "../controllers/case-follow-rules.controller.js";
import { prisma } from "../../../../shared/database/prisma.js";
import { caseFollowRulesService } from "../../../cases/services/case-follow-rules.service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: "report-abc-123" },
    userId: "user-1",
    userEmail: "user@example.com",
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("caseFollowRulesController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── follow ────────────────────────────────────────────────────────────────

  describe("follow", () => {
    it("returns 200 with rule data when report exists", async () => {
      (prisma.report.findUnique as any).mockResolvedValue(mockReport);
      (caseFollowRulesService.addRule as any).mockResolvedValue(mockRule);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.follow(req, res);

      expect(prisma.report.findUnique).toHaveBeenCalledWith({
        where: { id: "report-abc-123" },
      });
      expect(caseFollowRulesService.addRule).toHaveBeenCalledWith(
        "report-abc-123",
        "user-1",
        "case_created",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockRule,
      });
    });

    it("throws NotFoundError when report does not exist", async () => {
      (prisma.report.findUnique as any).mockResolvedValue(null);

      const req = mockReq({ params: { id: "nonexistent" } });
      const res = mockRes();

      await expect(caseFollowRulesController.follow(req, res)).rejects.toThrow(
        "Report nonexistent not found",
      );
    });
  });

  // ── unfollow ──────────────────────────────────────────────────────────────

  describe("unfollow", () => {
    it("returns 200 with success message when unfollow succeeds", async () => {
      (caseFollowRulesService.unfollow as any).mockResolvedValue(true);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.unfollow(req, res);

      expect(caseFollowRulesService.unfollow).toHaveBeenCalledWith(
        "report-abc-123",
        "user-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Unfollowed",
      });
    });

    it("throws NotFoundError when no active follow rule exists", async () => {
      (caseFollowRulesService.unfollow as any).mockResolvedValue(false);

      const req = mockReq();
      const res = mockRes();

      await expect(caseFollowRulesController.unfollow(req, res)).rejects.toThrow(
        "No active follow rule found",
      );
    });
  });

  // ── getFollowers ──────────────────────────────────────────────────────────

  describe("getFollowers", () => {
    it("returns 200 with mapped rules and count", async () => {
      (caseFollowRulesService.getRulesForCase as any).mockResolvedValue([mockRule]);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            userId: "user-1",
            triggerCondition: "case_created",
            notificationConfig: null,
            followedAt: "2026-08-30T10:00:00.000Z",
          },
        ],
        count: 1,
      });
    });

    it("returns empty array and count 0 when no followers", async () => {
      (caseFollowRulesService.getRulesForCase as any).mockResolvedValue([]);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        count: 0,
      });
    });
  });

  // ── getFollowStatus ───────────────────────────────────────────────────────

  describe("getFollowStatus", () => {
    it("returns following: true when user is following", async () => {
      (caseFollowRulesService.isFollowing as any).mockResolvedValue(true);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { following: true },
      });
    });

    it("returns following: false when user is not following", async () => {
      (caseFollowRulesService.isFollowing as any).mockResolvedValue(false);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { following: false },
      });
    });
  });

  // ── getFollowedReports ────────────────────────────────────────────────────

  describe("getFollowedReports", () => {
    it("returns empty data when user follows no cases", async () => {
      (caseFollowRulesService.getRulesForUser as any).mockResolvedValue([]);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowedReports(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        total: 0,
      });
    });

    it("returns enriched report list when user follows cases", async () => {
      (caseFollowRulesService.getRulesForUser as any).mockResolvedValue([mockRule]);
      (prisma.report.findMany as any).mockResolvedValue([mockReport]);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowedReports(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            id: "report-abc-123",
            title: "Pothole on Main St",
            status: "open",
            followTrigger: "case_created",
            followedAt: "2026-08-30T10:00:00.000Z",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ],
        total: 1,
      });
    });

    it("maps followTrigger to null when rule has no matching caseId", async () => {
      const ruleWithDifferentCase = { ...mockRule, caseId: "other-report" };
      (caseFollowRulesService.getRulesForUser as any).mockResolvedValue([
        ruleWithDifferentCase,
      ]);
      (prisma.report.findMany as any).mockResolvedValue([mockReport]);

      const req = mockReq();
      const res = mockRes();

      await caseFollowRulesController.getFollowedReports(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ followTrigger: null, followedAt: null }),
          ]),
        }),
      );
    });
  });
});
