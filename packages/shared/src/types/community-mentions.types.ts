export type MentionContext = 'comment' | 'moderator_reply' | 'status_update';

export interface CommunityMention {
  id: string;
  mentionedUserId: string;
  mentioningUserId: string;
  mentioningUserName: string;
  context: MentionContext;
  caseId: string;
  caseTitle: string;
  excerpt: string;
  createdAt: Date;
  read: boolean;
}

export interface MentionNotification {
  mention: CommunityMention;
  deliveryChannel: 'in_app' | 'email' | 'push';
}
