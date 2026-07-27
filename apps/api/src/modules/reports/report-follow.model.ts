import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

const FOLLOW_REASONS = [
  'OWNER',
  'COMMENTER',
  'ASSIGNEE',
  'STATUS_ACTOR',
  'MANUAL',
] as const;

export type FollowReason = (typeof FOLLOW_REASONS)[number];

export interface ReportFollow {
  reportId: Types.ObjectId;
  userId: Types.ObjectId;
  reason: FollowReason;
  active: boolean;
  createdAt: Date;
}

const reportFollowSchema = new Schema<ReportFollow>(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: 'Report',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: FOLLOW_REASONS,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

reportFollowSchema.index({ reportId: 1, userId: 1 }, { unique: true });
reportFollowSchema.index({ userId: 1, active: 1 });

export type ReportFollowDocument = HydratedDocument<ReportFollow>;

export const ReportFollowModel = model<ReportFollow>(
  'ReportFollow',
  reportFollowSchema,
);
