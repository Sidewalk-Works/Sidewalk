import { z } from 'zod';
import { UrgencyLevel } from '../types/notification-filters.types.js';

export const urgencyLevelSchema = z.enum([
  UrgencyLevel.LOW,
  UrgencyLevel.MEDIUM,
  UrgencyLevel.HIGH,
  UrgencyLevel.CRITICAL,
]);

export const proximityFilterSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(500),
});

export const timeRangeFilterSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
});

export const notificationFilterSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  urgency: z.array(urgencyLevelSchema),
  categories: z.array(z.string()),
  proximity: proximityFilterSchema.nullable(),
  timeRange: timeRangeFilterSchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export const filterPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  filters: notificationFilterSchema.omit({
    id: true,
    name: true,
    isActive: true,
    createdAt: true,
  }),
});

export const filterOptionsSchema = z.object({
  urgency: z.array(urgencyLevelSchema),
  categories: z.array(z.string()),
  proximity: proximityFilterSchema.nullable(),
  timeRange: timeRangeFilterSchema.nullable(),
});

export type NotificationFilterInput = z.infer<typeof notificationFilterSchema>;
export type FilterPresetInput = z.infer<typeof filterPresetSchema>;
export type FilterOptionsInput = z.infer<typeof filterOptionsSchema>;
