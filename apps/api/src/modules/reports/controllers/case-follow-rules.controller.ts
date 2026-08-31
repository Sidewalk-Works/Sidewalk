import { NotFoundError } from "../../../shared/errors/AppError.js";
import { caseFollowRulesService } from "../../cases/services/case-follow-rules.service.js";
import type { AuthenticatedRequest } from "../../../shared/middleware/requireAuth.js";
import { prisma } from "../../../shared/database/prisma.js";
import type { Response } from "express";

export const caseFollowRulesController = {
  async follow(req: AuthenticatedRequest, res: Response): Promise<void> {
    const caseId = req.params.id as string;

    const report = await prisma.report.findUnique({ where: { id: caseId } });
    if (!report) throw new NotFoundError(`Report ${caseId} not found`);

    const rule = await caseFollowRulesService.addRule(caseId, req.userId, "case_created");
    res.status(200).json({ success: true, data: rule });
  },

  async unfollow(req: AuthenticatedRequest, res: Response): Promise<void> {
    const caseId = req.params.id as string;

    const removed = await caseFollowRulesService.unfollow(caseId, req.userId);
    if (!removed) {
      throw new NotFoundError("No active follow rule found");
    }
    res.status(200).json({ success: true, message: "Unfollowed" });
  },

  async getFollowers(req: AuthenticatedRequest, res: Response): Promise<void> {
    const caseId = req.params.id as string;

    const rules = await caseFollowRulesService.getRulesForCase(caseId);
    res.status(200).json({
      success: true,
      data: rules.map((r) => ({
        userId: r.userId,
        triggerCondition: r.triggerCondition,
        notificationConfig: r.notificationConfig,
        followedAt: r.createdAtIso,
      })),
      count: rules.length,
    });
  },

  async getFollowStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const caseId = req.params.id as string;

    const following = await caseFollowRulesService.isFollowing(caseId, req.userId);
    res.status(200).json({ success: true, data: { following } });
  },

  async getFollowedReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    const rules = await caseFollowRulesService.getRulesForUser(req.userId);

    const caseIds = rules.map((r) => r.caseId);
    if (caseIds.length === 0) {
      res.status(200).json({ success: true, data: [], total: 0 });
      return;
    }

    const reports = await prisma.report.findMany({
      where: { id: { in: caseIds } },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: reports.map((report) => {
        const rule = rules.find((r) => r.caseId === report.id);
        return {
          id: report.id,
          title: report.title,
          status: report.status,
          followTrigger: rule?.triggerCondition ?? null,
          followedAt: rule?.createdAtIso ?? null,
          createdAt: report.createdAt.toISOString(),
        };
      }),
      total: reports.length,
    });
  },
};
