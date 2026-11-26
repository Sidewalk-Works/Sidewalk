import { Globe, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ADMINISTRATIVE_LEVEL_INFO,
  MEMBER_ROLE_INFO,
  ORGANIZATION_TYPE_INFO,
  ORG_VERIFICATION_INFO,
  type OfficialResponseDto,
  type OrganizationProfileDto,
  type Paginated,
  type ReportSummaryDto
} from "@sidewalk/contracts";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { ResponseCard } from "@/components/organizations/response-card";
import { LeaveOrganization } from "@/components/organizations/leave-organization";
import { ReportRow } from "@/components/report/report-row";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatNumber } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const org = await serverFetch<OrganizationProfileDto>(`/organizations/${slug}`);
    return {
      title: org.name,
      description:
        `${ORG_VERIFICATION_INFO[org.verificationStatus].label}. ${org.excerpt ?? ""}`.trim(),
      robots: org.suspended ? { index: false } : undefined
    };
  } catch {
    return { title: "Organization not found" };
  }
}

const METRICS = [
  {
    key: "reportsConnected",
    label: "Reports connected",
    meaning: "Public reports connected to this organization. Connected does not mean responsible."
  },
  {
    key: "reportsAcknowledged",
    label: "Acknowledged",
    meaning: "Public reports where the organization has published an acknowledgement."
  },
  {
    key: "resolutionsClaimed",
    label: "Resolutions claimed",
    meaning:
      "Public reports where the organization has said the issue is fixed. Claims, not outcomes."
  },
  {
    key: "claimsVerified",
    label: "Claims independently verified",
    meaning:
      "Of the reports this organization last claimed as resolved, those Sidewalk staff verified from photographs."
  }
] as const;

export default async function OrganizationPage({
  params,
  searchParams
}: {
  params: Promise<Params>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const [org, reports, responses, user] = await Promise.all([
    serverFetch<OrganizationProfileDto>(`/organizations/${slug}`),
    serverFetch<Paginated<ReportSummaryDto>>(
      `/organizations/${slug}/reports?page=${page}&pageSize=10`
    ),
    serverFetch<OfficialResponseDto[]>(`/organizations/${slug}/responses`),
    getSession()
  ]);
  const member = org.viewer.role;

  return (
    <article className="wrap pb-6 pt-10">
      <nav aria-label="Breadcrumb" className="text-[0.875rem] text-muted">
        <Link
          href="/organizations"
          className="underline decoration-rule underline-offset-2 hover:decoration-ink"
        >
          Organizations
        </Link>
      </nav>

      <header className="mt-6 grid gap-6 border-b-2 border-ink pb-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <div>
          <p className="eyebrow">
            {ORGANIZATION_TYPE_INFO[org.type].label} · {ADMINISTRATIVE_LEVEL_INFO[org.level].label}
          </p>
          <h1 className="display-lg mt-3 max-w-4xl">{org.name}</h1>
          <p className="mt-4 text-muted">{org.jurisdiction}</p>
          {org.aliases.length > 0 && (
            <p className="mt-1 text-[0.9rem] text-muted">Also known as {org.aliases.join(", ")}</p>
          )}
          {org.parent && (
            <p className="mt-1 text-[0.9rem] text-muted">
              Part of{" "}
              <Link
                href={`/organizations/${org.parent.slug}`}
                className="underline underline-offset-2"
              >
                {org.parent.name}
              </Link>
            </p>
          )}
        </div>
        <div className="self-end border-l-4 border-ink bg-paper-deep p-4">
          <OrganizationBadge org={org} />
          <p className="mt-3 text-[0.925rem] leading-snug">
            {org.suspended
              ? "Sidewalk staff suspended this organization. Its identity was checked, but it cannot speak on reports while suspended. What it published earlier stays on the record. A statement is still not the same as independent verification."
              : ORG_VERIFICATION_INFO[org.verificationStatus].meaning}
          </p>
          {org.verifiedAt && (
            <p className="mt-2 text-[0.8125rem] text-muted">
              Verified on {formatDate(org.verifiedAt)}
            </p>
          )}
        </div>
      </header>

      {org.suspended && (
        <Alert tone="warn" title="This organization is suspended" className="mt-8">
          It cannot publish official responses until Sidewalk staff reinstate it. What it published
          earlier stays on the record.
        </Alert>
      )}
      {org.verificationStatus === "UNVERIFIED" && (
        <Alert tone="info" title="This profile is not verified" className="mt-8">
          Sidewalk has not checked that it belongs to the institution it names. It cannot publish
          official responses, and nothing it says here should be read as official.
        </Alert>
      )}

      {member && (
        <section
          aria-labelledby="mine"
          className="mt-8 flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-surface p-5"
        >
          <div>
            <h2 id="mine" className="font-sans text-lg font-bold tracking-tight">
              You belong to this organization
            </h2>
            <p className="mt-1 text-[0.9rem] text-muted">
              Your role: {MEMBER_ROLE_INFO[member].label}. {MEMBER_ROLE_INFO[member].meaning}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {org.viewer.canManageMembers && (
              <ButtonLink href={`/organizations/${org.slug}/team`} variant="secondary">
                Manage the team
              </ButtonLink>
            )}
            <LeaveOrganization slug={org.slug} name={org.name} />
          </div>
        </section>
      )}
      {org.viewer.isStaff && (
        <p className="mt-6 text-[0.9rem]">
          <Link href="/admin/organizations" className="font-semibold underline underline-offset-4">
            Open the staff view of organizations
          </Link>
        </p>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <div className="min-w-0 space-y-14">
          {org.description && (
            <section aria-labelledby="about">
              <h2 id="about" className="eyebrow">
                About
              </h2>
              <p className="prose-sidewalk mt-4 max-w-2xl whitespace-pre-line text-[1.1rem]">
                {org.description}
              </p>
              <p className="mt-3 max-w-xl text-[0.85rem] text-muted">
                Written by the organization’s representatives. Sidewalk does not edit it.
              </p>
            </section>
          )}

          <section aria-labelledby="responses">
            <h2 id="responses" className="display-md">
              Recent official responses
            </h2>
            {responses.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No official responses yet">
                  Responses appear here when this organization answers a report.
                </EmptyState>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {responses.map((r) => (
                  <ResponseCard
                    key={r.id}
                    response={r}
                    showReport
                    signedIn={Boolean(user)}
                    canFlag={!member}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="reports">
            <h2 id="reports" className="display-md">
              Connected reports
            </h2>
            <p className="mb-6 mt-2 max-w-xl text-muted">
              Being connected to a report is not accepting responsibility for it.
            </p>
            {reports.items.length === 0 ? (
              <EmptyState title="No public reports are connected yet" />
            ) : (
              <div>
                {reports.items.map((r) => (
                  <ReportRow key={r.reference} report={r} />
                ))}
              </div>
            )}
            <div className="mt-8">
              <Pagination
                page={reports.page}
                totalPages={reports.totalPages}
                hrefFor={(p) => `/organizations/${org.slug}?page=${p}`}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-8" aria-label="Details">
          <section aria-labelledby="counts" className="border-t-2 border-ink pt-4">
            <h2 id="counts" className="eyebrow">
              Activity on public reports
            </h2>
            <dl className="mt-3 space-y-4">
              {METRICS.map((m) => (
                <div key={m.key}>
                  <dt className="text-[0.9rem] text-muted">{m.label}</dt>
                  <dd className="font-display text-[2rem] leading-none">
                    {formatNumber(org.metrics[m.key])}
                  </dd>
                  <dd className="mt-1 text-[0.8rem] leading-snug text-muted">{m.meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.8rem] text-muted">
              Counts over {org.metrics.window}, {org.metrics.scope}. Sidewalk shows no rates,
              averages or response times, because they would need a denominator and a time window
              that could mislead.
            </p>
          </section>

          {(org.website || org.publicEmail || org.publicPhone) && (
            <section aria-labelledby="contact" className="border-t-2 border-ink pt-4">
              <h2 id="contact" className="eyebrow">
                Public contact
              </h2>
              <ul className="mt-3 space-y-2 text-[0.95rem]">
                {org.website && (
                  <li className="flex items-center gap-2">
                    <Globe className="size-4 shrink-0" aria-hidden />
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all underline underline-offset-2"
                    >
                      {org.website}
                    </a>
                  </li>
                )}
                {org.publicEmail && (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0" aria-hidden />
                    <a
                      href={`mailto:${org.publicEmail}`}
                      className="break-all underline underline-offset-2"
                    >
                      {org.publicEmail}
                    </a>
                  </li>
                )}
                {org.publicPhone && (
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 shrink-0" aria-hidden />
                    {org.publicPhone}
                  </li>
                )}
              </ul>
              <p className="mt-3 text-[0.8rem] text-muted">
                Provided by the organization. Sidewalk has not checked these details.
              </p>
            </section>
          )}

          {org.serviceAreas.length > 0 && (
            <section aria-labelledby="areas" className="border-t-2 border-ink pt-4">
              <h2 id="areas" className="eyebrow">
                Areas served
              </h2>
              <ul className="mt-3 list-disc pl-5 text-[0.95rem]">
                {org.serviceAreas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
