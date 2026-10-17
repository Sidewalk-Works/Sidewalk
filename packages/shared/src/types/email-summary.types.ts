export interface DigestRecipient {
  userId: string;
  email: string;
  name: string;
}

export interface DigestItem {
  id: string;
  category: string;
  title: string;
  description: string;
}

export interface EmailDigestTemplate {
  templateId: string;
  frequency: 'daily' | 'weekly';
  recipient: DigestRecipient;
  items: DigestItem[];
  generatedAtIso: string;
}
