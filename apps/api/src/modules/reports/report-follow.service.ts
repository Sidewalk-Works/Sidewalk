import { Types } from 'mongoose';
import {
  ReportFollowModel,
  type FollowReason,
} from './report-follow.model.js';

export async function followReport(params: {
  reportId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: FollowReason;
}) {
  return ReportFollowModel.findOneAndUpdate(
    { reportId: params.reportId, userId: params.userId },
    { $set: { active: true, reason: params.reason } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function unfollowReport(
  reportId: Types.ObjectId,
  userId: Types.ObjectId,
) {
  return ReportFollowModel.findOneAndUpdate(
    { reportId, userId },
    { $set: { active: false } },
    { new: true },
  );
}

export async function isFollowing(
  reportId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<boolean> {
  const follow = await ReportFollowModel.findOne({
    reportId,
    userId,
    active: true,
  }).lean();
  return follow !== null;
}

export async function getFollowers(reportId: Types.ObjectId) {
  return ReportFollowModel.find({ reportId, active: true })
    .sort({ createdAt: 1 })
    .lean();
}

export async function getFollowerCount(reportId: Types.ObjectId): Promise<number> {
  return ReportFollowModel.countDocuments({ reportId, active: true });
}

export async function getFollowedReports(userId: Types.ObjectId) {
  return ReportFollowModel.find({ userId, active: true })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Auto-follow rules:
 * - Creator follows on report creation (OWNER)
 * - Commenter follows when commenting (COMMENTER)
 * - Admin follows when changing status (STATUS_ACTOR)
 * - Assignee follows when assigned (ASSIGNEE)
 *
 * All auto-follows are idempotent — re-following an already-followed report
 * updates the reason but keeps the follow active.
 */
export async function autoFollow(params: {
  reportId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: FollowReason;
}) {
  return followReport(params);
}
