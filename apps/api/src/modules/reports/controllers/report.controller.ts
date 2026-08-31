import type { Request, Response } from "express";
import { ValidationError } from "../../../shared/errors/AppError.js";
import { reportService } from "../services/report.service.js";
import { reportSubmissionSchema, moderationSchema } from "../validators/report.validator.js";
import type { AuthenticatedRequest } from "../../../shared/middleware/requireAuth.js";
import type { AuthTokenPayload } from "../../auth/types/auth.types.js";
import { caseFollowRulesService } from "../../cases/services/case-follow-rules.service.js";

export const reportController = {
  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    const parsed = reportSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const result = await reportService.create(parsed.data, { sub: req.userId, email: req.userEmail ?? "" } as AuthTokenPayload);

    await caseFollowRulesService.autoFollowOnCreation(result.id, req.userId);

    res.status(201).json({ success: true, data: result });
  },

  async list(req: Request, res: Response): Promise<void> {
    const { status, authorId, page, pageSize } = req.query as {
      status?: string;
      authorId?: string;
      page?: string;
      pageSize?: string;
    };

    // Validate status against known enum values
    const validStatuses = ["open", "in_progress", "resolved", "closed", "pending"] as const;
    if (status && !validStatuses.includes(status as (typeof validStatuses)[number])) {
      throw new ValidationError(
        `Invalid status '${status}'. Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    // Validate authorId as UUID format
    if (authorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorId)) {
      throw new ValidationError("Invalid authorId format. Must be a valid UUID.");
    }

    // Pagination with sane defaults
    const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize ?? "20", 10) || 20));
    const offset = (pageNum - 1) * size;

    const result = await reportService.list({ status, authorId, limit: size, offset });
    res.json({
      success: true,
      data: result.reports,
      total: result.total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(result.total / size),
    });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const report = await reportService.findById(id);
    res.json({ success: true, data: report });
  },

  async moderate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const parsed = moderationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const id = req.params.id as string;
    const report = await reportService.moderate(id, parsed.data, req.userId);

    await caseFollowRulesService.autoFollowOnStatusChange(id, req.userId);

    res.json({ success: true, data: report });
  },
};
