import { z } from "zod";

/**
 * Profile fields a user may update themselves (#824).
 *
 * All fields are optional so a PATCH-style update can touch one field at a
 * time. Every string is trimmed and length-capped to keep the database rows
 * reasonable.
 */
export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name cannot be empty.")
      .max(60, "Display name must be 60 characters or fewer.")
      .nullable()
      .optional(),
    avatarUrl: z
      .string()
      .trim()
      .url("Avatar URL must be a valid URL.")
      .max(500, "Avatar URL must be 500 characters or fewer.")
      .nullable()
      .optional(),
    bio: z
      .string()
      .trim()
      .max(280, "Bio must be 280 characters or fewer.")
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one profile field must be provided.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
