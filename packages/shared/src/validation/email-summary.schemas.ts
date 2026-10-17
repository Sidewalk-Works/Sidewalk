import { z } from 'zod';

export const digestRecipientSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

export const digestItemSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const emailDigestTemplateSchema = z.object({
  templateId: z.string().min(1),
  frequency: z.enum(['daily', 'weekly']),
  recipient: digestRecipientSchema,
  items: z.array(digestItemSchema),
  generatedAtIso: z.string().min(1),
});

export type EmailDigestTemplateInput = z.infer<typeof emailDigestTemplateSchema>;
