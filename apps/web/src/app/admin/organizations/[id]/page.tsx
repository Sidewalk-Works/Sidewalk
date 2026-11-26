import Link from "next/link";
import { notFound } from "next/navigation";
import {
  APPLICATION_STATUS_INFO,
  MEMBER_ROLE_INFO,
  ORGANIZATION_TYPE_INFO,
  type StaffOrganizationDto
} from "@sidewalk/contracts";
import { OrganizationGovernance } from "@/components/admin/organization-governance";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

const ACTION_WORDS: Record<string, string> = {
  REVIEW_STARTED: "Review started",
  INFO_REQUESTED: "Question sent",
  APPROVED: "Verified",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
  REINSTATED: "Reinstated",
  REVOKED: "Verification withdrawn"
};

export default async function StaffOrganizationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [org, user] = await Promise.all([
    serverFetch<StaffOrganizationDto>(`/moderation/organizations/${id}`),
    getSession()
  ]);
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_24rem]">
      <div className="min-w-0 space-y-10">
        <header>
          <p className="eyebrow">{ORGANIZATION_TYPE_INFO[org.type].label}</p>
          <h3 className="display-md mt-2">
            <Link
              href={`/organizations/${org.slug}`}
              className="underline decoration-laterite decoration-2 underline-offset-4"
            >
              {org.name}
            </Link>
          </h3>
          <p className="mt-2">
            <OrganizationBadge
              org={{
                verificationStatus: org.verificationStatus,
                suspended: org.status === "SUSPENDED"
              }}
            />
          </p>
          <p className="mt-2 text-[0.875rem] text-muted">
            {org.jurisdiction} · created {formatDateTime(org.createdAt)} by {org.createdByName} ·{" "}
            {org.publicProfile ? "listed publicly" : "not listed publicly"}
          </p>
        </header>

        <section aria-labelledby="hist">
          <h4 id="hist" className="eyebrow">
            Verification history
          </h4>
          {org.decisions.length === 0 ? (
            <p className="mt-2 text-muted">No decisions have been recorded.</p>
          ) : (
            <ol className="mt-3 border-t-2 border-ink">
              {org.decisions.map((d) => (
                <li key={d.id} className="border-b border-rule py-3">
                  <p className="font-semibold">{ACTION_WORDS[d.action] ?? d.action}</p>
                  <p className="text-[0.85rem] text-muted">
                    {d.actorName} · {formatDateTime(d.createdAt)}
                  </p>
                  {d.reason && (
                    <p className="mt-1 max-w-2xl whitespace-pre-line text-[0.95rem]">{d.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="applications">
          <h4 id="applications" className="eyebrow">
            Applications
          </h4>
          {org.applications.length === 0 ? (
            <p className="mt-2 text-muted">None.</p>
          ) : (
            <ul className="mt-3 border-t-2 border-ink">
              {org.applications.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-rule py-3"
                >
                  <Link
                    href={`/admin/organizations/applications/${a.id}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    {a.applicantName}
                  </Link>
                  <span className="text-[0.9rem]">{APPLICATION_STATUS_INFO[a.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="members">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h4 id="members" className="eyebrow">
              Members
            </h4>
            <Link
              href={`/organizations/${org.slug}/team`}
              className="text-[0.9rem] font-semibold underline underline-offset-4"
            >
              Manage the team
            </Link>
          </div>
          <ul className="mt-3 border-t-2 border-ink">
            {org.members
              .filter((m) => m.status === "ACTIVE")
              .map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-rule py-3"
                >
                  <span>
                    {m.name} <span className="text-muted">({m.email})</span>
                  </span>
                  <span>{MEMBER_ROLE_INFO[m.role].label}</span>
                </li>
              ))}
          </ul>
          {org.invitations.filter((i) => i.status === "PENDING").length > 0 && (
            <p className="mt-3 text-[0.9rem] text-muted">
              {org.invitations.filter((i) => i.status === "PENDING").length} invitation(s) waiting.
              An invitation does not make anyone verified.
            </p>
          )}
        </section>
      </div>
      <aside aria-label="Actions">
        <OrganizationGovernance org={org} isAdmin={user?.role === "ADMIN"} />
      </aside>
    </div>
  );
}
