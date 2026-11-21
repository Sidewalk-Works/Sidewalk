import { z } from "zod";
import { ModerationOutcome, ReportCategory, ReportStatus, Visibility } from "../types/enums.js";

export const reportSubmissionSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  description: z.string().min(1, "Description is required.").max(5000),
  category: z.nativeEnum(ReportCategory),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  // Legacy fields retained for compatibility with older clients.
  visibility: z
    .enum([Visibility.PUBLIC, Visibility.PRIVATE, Visibility.MODERATORS_ONLY])
    .optional(),
  location: z.string().optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
});

export const reportStatusSchema = z.enum([
  ReportStatus.SUBMITTED,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.VERIFIED,
  ReportStatus.ASSIGNED,
  ReportStatus.IN_PROGRESS,
  ReportStatus.RESOLVED,
  ReportStatus.CLOSED,
]);

export const moderationSchema = z.object({
  outcome: z.enum([
    ModerationOutcome.APPROVED,
    ModerationOutcome.REJECTED,
    ModerationOutcome.FLAGGED,
    ModerationOutcome.ESCALATED,
  ]),
  reason: z.string().max(1000).optional(),
});

export type ReportSubmissionInput = z.infer<typeof reportSubmissionSchema>;
export type ModerationInput = z.infer<typeof moderationSchema>;
