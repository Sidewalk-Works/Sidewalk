import { z } from "zod";
import { LIMITS } from "@sidewalk/contracts";

export const reportSchema = z.object({
  categorySlug: z.string().min(1, "Choose the category that fits best."),
  title: z
    .string()
    .trim()
    .min(
      LIMITS.title.min,
      `Give the report a short, specific title (at least ${LIMITS.title.min} characters).`
    )
    .max(LIMITS.title.max, `Keep the title under ${LIMITS.title.max} characters.`),
  description: z
    .string()
    .trim()
    .min(
      LIMITS.description.min,
      `Describe what is wrong in at least ${LIMITS.description.min} characters.`
    )
    .max(
      LIMITS.description.max,
      `Keep the description under ${LIMITS.description.max} characters.`
    ),
  latitude: z
    .number({ error: "Place the pin on the map, search for the place, or enter coordinates." })
    .min(-90)
    .max(90),
  longitude: z
    .number({ error: "Place the pin on the map, search for the place, or enter coordinates." })
    .min(-180)
    .max(180),
  addressText: z
    .string()
    .trim()
    .max(LIMITS.address.max, `Keep this under ${LIMITS.address.max} characters.`)
    .optional(),
  areaName: z.string().trim().max(120).optional(),
  showReporterName: z.boolean()
});

export type ReportValues = z.infer<typeof reportSchema>;
