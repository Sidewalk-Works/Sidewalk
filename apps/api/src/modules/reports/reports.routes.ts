import { Router } from 'express';
import {
  addReportComment,
  createReport,
  getPublicReportById,
  getReportDetail,
  getReportComments,
  listReports,
  listPublicReports,
  getMapReports,
  getMyReports,
  verifyReport,
  updateReportStatus,
  verifyStatus,
} from './reports.controller';
import { authenticateToken, requireRole } from '../auth/auth.middleware';
import { validateRequest } from '../../core/validation/validate-request';
import { stellarAnchoringRateLimiter } from '../../core/rate-limit/rate-limit.middleware';
import {
  createReportBodySchema,
  myReportsQuerySchema,
  listReportsQuerySchema,
  publicReportListQuerySchema,
  reportCommentBodySchema,
  reportDetailParamsSchema,
  reportsMapQuerySchema,
  updateReportStatusBodySchema,
  verifyReportBodySchema,
  verifyStatusBodySchema,
} from './reports.schemas';
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
import { Types } from 'mongoose';
import { AppError } from '../../core/errors/app-error';

const router: Router = Router();

router.get(
  '/followed',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ query: followedReportsQuerySchema }),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

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

router.get(
  '/public',
  validateRequest({ query: publicReportListQuerySchema }),
  listPublicReports,
);

router.get(
  '/public/:reportId',
  validateRequest({ params: reportDetailParamsSchema }),
  getPublicReportById,
);

router.get(
  '/',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ query: listReportsQuerySchema }),
  listReports,
);

router.get(
  '/map',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ query: reportsMapQuerySchema }),
  getMapReports,
);

router.get(
  '/mine',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ query: myReportsQuerySchema }),
  getMyReports,
);

router.post(
  '/',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  stellarAnchoringRateLimiter,
  validateRequest({ body: createReportBodySchema }),
  createReport,
);

router.get(
  '/:reportId',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: reportDetailParamsSchema }),
  getReportDetail,
);

router.post(
  '/:reportId/follow',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: followReportParamsSchema }),
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;
      if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

      const report = await ReportModel.findById(reportId).lean();
      if (!report) throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');

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
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;
      if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

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
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      const report = await ReportModel.findById(reportId).lean();
      if (!report) throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');

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
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id;
      if (!userId) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

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
  '/:reportId/comments',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: reportDetailParamsSchema }),
  getReportComments,
);

router.post(
  '/:reportId/comments',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ params: reportDetailParamsSchema, body: reportCommentBodySchema }),
  addReportComment,
);

router.post(
  '/verify',
  authenticateToken,
  requireRole(['CITIZEN', 'AGENCY_ADMIN']),
  validateRequest({ body: verifyReportBodySchema }),
  verifyReport,
);

router.post(
  '/status',
  authenticateToken,
  requireRole(['AGENCY_ADMIN']),
  validateRequest({ body: updateReportStatusBodySchema }),
  updateReportStatus,
);

router.post(
  '/status/verify',
  authenticateToken,
  requireRole(['AGENCY_ADMIN']),
  validateRequest({ body: verifyStatusBodySchema }),
  verifyStatus,
);

export default router;
