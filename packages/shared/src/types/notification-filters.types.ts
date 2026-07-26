export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';
export type FilterCategory = 'all' | 'reports' | 'moderation' | 'mentions' | 'system';

export interface NotificationFilter {
  urgency?: UrgencyLevel[];
  category?: FilterCategory[];
  locationRadius?: number;
  locationCenter?: { lat: number; lng: number };
  dateRange?: { from: Date; to: Date };
  readStatus?: 'all' | 'unread' | 'read';
}

export interface FilterPreset {
  id: string;
  name: string;
  filter: NotificationFilter;
  isDefault: boolean;
}
