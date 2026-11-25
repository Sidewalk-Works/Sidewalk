import {
  ORGANIZATION_LIMITS,
  type ApplicationDocumentDto,
  type OrganizationBadgeDto,
  type OrganizationSummaryDto
} from "@sidewalk/contracts";
import { excerpt } from "../common/utils/text";
import type { Organization } from "../generated/prisma/client";

type BadgeSource = Pick<Organization, "slug" | "name" | "verificationStatus" | "status">;

/** Built from an explicit allow-list, never by spreading a row: nothing not named here can leave the API. */
export function toBadge(o: BadgeSource): OrganizationBadgeDto {
  return {
    slug: o.slug,
    name: o.name,
    verified: o.verificationStatus === "VERIFIED",
    verificationStatus: o.verificationStatus,
    suspended: o.status === "SUSPENDED"
  };
}

export function toOrganizationSummary(
  o: BadgeSource & Pick<Organization, "type" | "level" | "jurisdiction" | "description">
): OrganizationSummaryDto {
  return {
    ...toBadge(o),
    type: o.type,
    level: o.level,
    jurisdiction: o.jurisdiction,
    excerpt: o.description ? excerpt(o.description, 160) : null
  };
}

export const documentUrl = (id: string) => `/api/v1/organization-documents/${id}/file`;

export function toDocumentDto(d: {
  id: string;
  caption: string | null;
  createdAt: Date;
  width: number;
  height: number;
}): ApplicationDocumentDto {
  return {
    id: d.id,
    caption: d.caption,
    createdAt: d.createdAt.toISOString(),
    width: d.width,
    height: d.height,
    url: documentUrl(d.id)
  };
}

/** Whitespace-trimmed, de-duplicated, bounded list of short strings. */
export function cleanList(values: string[] | undefined, max: number, count: number): string[] {
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const v = raw.replace(/\s+/g, " ").trim().slice(0, max);
    if (v) seen.add(v);
    if (seen.size >= count) break;
  }
  return [...seen];
}

export const MAX_DOCUMENTS = ORGANIZATION_LIMITS.documentsPerApplication;
