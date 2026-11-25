import { randomUUID } from "node:crypto";
import { normalizeOrganizationName, slugifyOrganizationName } from "@sidewalk/contracts";
import type { Organization } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  Client,
  PASSWORD,
  createUser,
  makeReport,
  pngImage,
  signedIn,
  type TestApp
} from "./helpers";

export interface OrgSeed {
  name?: string;
  verified?: boolean;
  suspended?: boolean;
  revoked?: boolean;
  listed?: boolean;
  type?: Organization["type"];
  level?: Organization["level"];
  jurisdiction?: string;
  createdById: string;
}

/** An organization in exactly the state a test needs, written directly so each test stays about one rule. */
export async function createOrg(prisma: PrismaService, seed: OrgSeed): Promise<Organization> {
  const name = seed.name ?? `Test Works Agency ${randomUUID().slice(0, 6)}`;
  const verified = seed.verified ?? false;
  return prisma.organization.create({
    data: {
      slug: `${slugifyOrganizationName(name) || "org"}-${randomUUID().slice(0, 4)}`,
      name,
      normalizedName: normalizeOrganizationName(name),
      type: seed.type ?? "AGENCY",
      level: seed.level ?? "STATE",
      jurisdiction: seed.jurisdiction ?? "Lagos State",
      verificationStatus: seed.revoked ? "REVOKED" : verified ? "VERIFIED" : "UNVERIFIED",
      verifiedAt: verified || seed.revoked ? new Date() : null,
      verificationRevokedAt: seed.revoked ? new Date() : null,
      status: seed.suspended ? "SUSPENDED" : "ACTIVE",
      suspendedAt: seed.suspended ? new Date() : null,
      publicProfile: seed.listed ?? (verified || seed.revoked === true),
      createdById: seed.createdById
    }
  });
}

export function addMember(
  prisma: PrismaService,
  organizationId: string,
  userId: string,
  role: "ADMIN" | "REPRESENTATIVE" | "MEMBER" = "REPRESENTATIVE"
) {
  return prisma.organizationMember.create({ data: { organizationId, userId, role } });
}

/** A verified, active organization with an administrator and a representative, each signed in. */
export async function verifiedOrg(t: TestApp, name?: string) {
  const staff = await signedIn(t.app, t.prisma, "ADMIN");
  const org = await createOrg(t.prisma, { name, verified: true, createdById: staff.user.id });
  const admin = await signedIn(t.app, t.prisma, "CITIZEN");
  const rep = await signedIn(t.app, t.prisma, "CITIZEN");
  await addMember(t.prisma, org.id, admin.user.id, "ADMIN");
  await addMember(t.prisma, org.id, rep.user.id, "REPRESENTATIVE");
  return { org, staff, admin, rep };
}

/** A visible report filed by a fresh citizen, with the organization already connected (the representative's own doing). */
export async function connectedReport(t: TestApp, orgId: string, adderId: string) {
  const reporter = await signedIn(t.app, t.prisma, "CITIZEN");
  const report = await makeReport(reporter.client);
  await t.prisma.reportOrganization.create({
    data: {
      reportId: report.id,
      organizationId: orgId,
      basis: "ORGANIZATION_ADDED",
      status: "ACTIVE",
      addedById: adderId
    }
  });
  return { reporter, report };
}

/** An unconnected report, for tests about connecting. */
export async function plainReport(t: TestApp) {
  const reporter = await signedIn(t.app, t.prisma, "CITIZEN");
  const report = await makeReport(reporter.client);
  return { reporter, report };
}

export const ORG_FIELDS = {
  name: "Ogun State Ministry of Roads",
  type: "DEPARTMENT",
  level: "STATE",
  jurisdiction: "Ogun State",
  description: "Maintains state roads and bridges."
} as const;

export const APPLICATION = {
  organization: ORG_FIELDS,
  roleTitle: "Director of Communications",
  authorityStatement:
    "I am the named public information officer on the ministry's official web page.",
  officialReferences: [
    {
      kind: "Official website",
      label: "Ministry staff page",
      value: "https://roads.ogunstate.example/staff"
    }
  ]
} as const;

/** Creates and submits an application for a new organization as a fresh citizen. */
export async function submitApplication(
  t: TestApp,
  overrides: Record<string, unknown> = {},
  orgOverrides: Record<string, unknown> = {}
) {
  const applicant = await signedIn(t.app, t.prisma, "CITIZEN");
  const created = await applicant.client.post("/organization-applications", {
    ...APPLICATION,
    ...overrides,
    organization: { ...ORG_FIELDS, ...orgOverrides }
  });
  if (created.status !== 201)
    throw new Error(`create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const submitted = await applicant.client.post(
    `/organization-applications/${created.body.id}/submit`,
    {}
  );
  if (submitted.status !== 200)
    throw new Error(`submit failed: ${submitted.status} ${JSON.stringify(submitted.body)}`);
  return {
    applicant,
    application: submitted.body as { id: string; organization: { id: string; slug: string } }
  };
}

export async function staffClient(t: TestApp, role: "MODERATOR" | "ADMIN" = "ADMIN") {
  return signedIn(t.app, t.prisma, role);
}

export async function resolutionPhoto(
  client: Client,
  reference: string,
  organization: string,
  width = 130
) {
  return client.upload(
    `/reports/${reference}/evidence`,
    await pngImage(width, 90 + (width % 17)),
    "fix.png",
    { kind: "RESOLUTION", organization }
  );
}

export { Client, PASSWORD, createUser, makeReport, pngImage, signedIn };
