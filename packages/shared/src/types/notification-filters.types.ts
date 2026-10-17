export interface NotificationFilter {
  id: string;
  name: string;
  urgency: UrgencyLevel[];
  categories: string[];
  proximity: ProximityFilter | null;
  timeRange: TimeRangeFilter | null;
  isActive: boolean;
  createdAt: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: Omit<NotificationFilter, 'id' | 'name' | 'isActive' | 'createdAt'>;
}

export interface FilterOptions {
  urgency: UrgencyLevel[];
  categories: string[];
  proximity: ProximityFilter | null;
  timeRange: TimeRangeFilter | null;
}

export interface ProximityFilter {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface TimeRangeFilter {
  startIso: string;
  endIso: string;
}

export const UrgencyLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type UrgencyLevel = (typeof UrgencyLevel)[keyof typeof UrgencyLevel];
