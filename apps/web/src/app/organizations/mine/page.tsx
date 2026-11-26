import type { Metadata } from "next";
import Link from "next/link";
import {
  APPLICATION_STATUS_INFO,
  MEMBER_ROLE_INFO,
  type ApplicationStatus,
  type MemberRole,
  type OrganizationBadgeDto
} from "@sidewalk/contracts";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/format";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "My organizations", robots: { index: false } };

interface Mine {
  memberships: Array<{
    role: MemberRole;
    organization: OrganizationBadgeDto;
    blocker: string | null;
  }>;
  applications: Array<{
    id: string;
    status: ApplicationStatus;
    organization: { slug: string; name: string };
    updatedAt: string;
  }>;
}

export default async function MyOrganizationsPage() {
  await requireUser("/organizations/mine");
  const mine = await serverFetch<Mine>("/organizations/mine");
  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">Organizations</p>
        <h1 className="display-lg mt-3">My organizations</h1>
        <p className="mt-5 text-[1.2rem] leading-relaxed text-ink-soft">
          Organizations you belong to, and applications you have made. Belonging to an organization
          never gives you any Sidewalk staff powers.
        </p>
      </header>

      <section aria-labelledby="member" className="mt-10">
        <h2 id="member" className="display-md">
          Where you belong
        </h2>
        {mine.memberships.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="You do not belong to any organization"
              action={
                <ButtonLink href="/organizations/apply" variant="secondary">
                  Apply to represent one
                </ButtonLink>
              }
            >
              An administrator can invite you, or you can apply to represent an institution.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 border-t-2 border-ink">
            {mine.memberships.map((m) => (
              <li key={m.organization.slug} className="border-b border-rule py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="display-md">
                    <Link
                      href={`/organizations/${m.organization.slug}`}
                      className="underline decoration-laterite decoration-2 underline-offset-4"
                    >
                      {m.organization.name}
                    </Link>
                  </h3>
                  <OrganizationBadge org={m.organization} />
                </div>
                <p className="mt-2 text-[0.95rem]">
                  {MEMBER_ROLE_INFO[m.role].label}. {MEMBER_ROLE_INFO[m.role].meaning}
                </p>
                {m.blocker && (
                  <p className="mt-2 border-l-4 border-signal bg-signal-wash px-3 py-2 text-[0.9rem]">
                    {m.blocker}
                  </p>
                )}
                {MEMBER_ROLE_INFO[m.role].canManage && (
                  <p className="mt-2">
                    <Link
                      href={`/organizations/${m.organization.slug}/team`}
                      className="font-semibold underline underline-offset-4"
                    >
                      Manage the team
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="apps" className="mt-14">
        <h2 id="apps" className="display-md">
          Your applications
        </h2>
        {mine.applications.length === 0 ? (
          <p className="mt-3 text-muted">You have not applied for anything.</p>
        ) : (
          <ul className="mt-4 border-t-2 border-ink">
            {mine.applications.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-4"
              >
                <Link
                  href={`/organizations/applications/${a.id}`}
                  className="font-semibold underline decoration-laterite decoration-2 underline-offset-4"
                >
                  {a.organization.name}
                </Link>
                <span className="text-[0.9rem]">
                  {APPLICATION_STATUS_INFO[a.status].label} · updated {timeAgo(a.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
