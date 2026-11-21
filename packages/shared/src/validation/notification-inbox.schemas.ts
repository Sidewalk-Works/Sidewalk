import { z } from "zod";

export const inAppNotificationItemSchema = z.object({
  id: z.string().min(1, "Notification ID is required."),
  user_id: z.string().min(1, "Recipient user ID is required."),
  type: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  read: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type InAppNotificationItemInput = z.infer<typeof inAppNotificationItemSchema>;
