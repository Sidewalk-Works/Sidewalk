export interface DeduplicationRuleOptions {
  groupingWindowMinutes: number;
  maxEventsPerGroup: number;
}

export interface GroupedCaseNotification {
  groupId: string;
  caseId: string;
  caseTitle: string;
  updateCount: number;
  latestMessage: string;
  participantCount: number;
  firstEventAtIso: string;
  lastEventAtIso: string;
}

export interface NotificationGroupSummary {
  userId: string;
  groupedNotifications: GroupedCaseNotification[];
}

export interface NotificationUpdate {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
}

export interface GroupedNotification {
  caseId: string;
  caseTitle: string;
  updates: NotificationUpdate[];
  count: number;
  latestUpdate: Date;
}
