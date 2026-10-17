import { z } from 'zod';

export const pushRegistrationDataSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  optIn: z.boolean().default(true),
  registeredAtIso: z.string().min(1),
});

export type PushRegistrationDataInput = z.infer<typeof pushRegistrationDataSchema>;
