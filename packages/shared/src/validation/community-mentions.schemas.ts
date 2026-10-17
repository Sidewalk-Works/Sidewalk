import { z } from 'zod';

export const commentAuthorInfoSchema = z.object({
  userId: z.string().min(1, 'Author User ID is required.'),
  username: z.string().min(1),
  role: z.enum(['citizen', 'moderator', 'admin']),
});

export const mentionTagSchema = z.object({
  mentionedUsername: z.string().min(1),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
});

export const mentionNotificationPayloadSchema = z.object({
  notificationId: z.string().min(1),
  author: commentAuthorInfoSchema,
  caseId: z.string().min(1),
  commentId: z.string().min(1),
  snippet: z.string().max(250),
  mentions: z.array(mentionTagSchema),
  notifiedAtIso: z.string().min(1),
});

export type MentionNotificationPayloadInput = z.infer<typeof mentionNotificationPayloadSchema>;
