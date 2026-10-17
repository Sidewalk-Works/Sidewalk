export type SignalTheme = 'default' | 'highlight' | 'urgent';

export interface RefinedProgressEvent {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  theme: SignalTheme;
  publishedAtIso: string;
}

export interface ActivityFeedState {
  events: RefinedProgressEvent[];
  lastPolledIso: string;
  isLive: boolean;
}
