import { z } from 'zod';

export const followReportParamsSchema = z.object({
  reportId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'reportId must be a valid ObjectId'),
});

export const unfollowReportParamsSchema = z.object({
  reportId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'reportId must be a valid ObjectId'),
});

export const listFollowersParamsSchema = z.object({
  reportId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'reportId must be a valid ObjectId'),
});

export const followedReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type FollowReportParamsDTO = z.infer<typeof followReportParamsSchema>;
export type UnfollowReportParamsDTO = z.infer<typeof unfollowReportParamsSchema>;
export type ListFollowersParamsDTO = z.infer<typeof listFollowersParamsSchema>;
export type FollowedReportsQueryDTO = z.infer<typeof followedReportsQuerySchema>;
