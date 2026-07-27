import { Router, type Request, type Response, type NextFunction } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../core/errors/app-error';
import { authenticateToken, requireRole } from '../auth/auth.middleware';
import { validateRequest } from '../../core/validation/validate-request';
import {
  followReportParamsSchema,
  unfollowReportParamsSchema,
  listFollowersParamsSchema,
  followedReportsQuerySchema,
} from './report-follow.schemas';
import {
  followReport,
  unfollowReport,
  isFollowing,
  getFollowers,
  getFollowerCount,
  getFollowedReports,
} from './report-follow.service';
import { ReportModel } from './report.model';

const router: Router = Router();

router.post(
  '/:reportId/follow',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: followReportParamsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      const report = await ReportModel.findById(reportId).lean();
      if (!report) {
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
      }

      await followReport({
        reportId: new Types.ObjectId(reportId),
        userId: new Types.ObjectId(userId),
        reason: 'MANUAL',
      });

      return res.status(200).json({ message: 'Now following report' });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:reportId/follow',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: unfollowReportParamsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      await unfollowReport(
        new Types.ObjectId(reportId),
        new Types.ObjectId(userId),
      );

      return res.status(200).json({ message: 'Unfollowed report' });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:reportId/followers',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: listFollowersParamsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.params;

      const report = await ReportModel.findById(reportId).lean();
      if (!report) {
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
      }

      const [followers, count] = await Promise.all([
        getFollowers(new Types.ObjectId(reportId)),
        getFollowerCount(new Types.ObjectId(reportId)),
      ]);

      return res.status(200).json({
        data: followers.map((f) => ({
          userId: String(f.userId),
          reason: f.reason,
          followedAt: f.createdAt,
        })),
        count,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:reportId/follow-status',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: listFollowersParamsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      const following = await isFollowing(
        new Types.ObjectId(reportId),
        new Types.ObjectId(userId),
      );

      return res.status(200).json({ following });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/followed',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ query: followedReportsQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      const { page, pageSize } = req.query as unknown as {
        page: number;
        pageSize: number;
      };

      const followed = await getFollowedReports(new Types.ObjectId(userId));

      const reportIds = followed.map((f) => f.reportId);
      const reports = await ReportModel.find({ _id: { $in: reportIds } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

      return res.status(200).json({
        data: reports.map((report) => {
          const withTimestamps = report as typeof report & {
            createdAt?: Date;
            updatedAt?: Date;
          };
          const follow = followed.find(
            (f) => String(f.reportId) === String(report._id),
          );

          return {
            id: String(report._id),
            title: report.title,
            category: report.category,
            status: report.status,
            followReason: follow?.reason ?? null,
            followedAt: follow?.createdAt ?? null,
            createdAt: withTimestamps.createdAt?.toISOString() ?? null,
          };
        }),
        pagination: {
          page,
          pageSize,
          total: reportIds.length,
          totalPages: Math.ceil(reportIds.length / pageSize),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
