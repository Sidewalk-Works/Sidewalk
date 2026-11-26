import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InvitationDto, MemberDto, OrganizationProfileDto } from "@sidewalk/contracts";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { TeamManager } from "@/components/organizations/team-manager";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/organizations/${slug}/team`);
  const org = await serverFetch<OrganizationProfileDto>(`/organizations/${slug}`);
  if (!org.viewer.role && !org.viewer.isStaff) notFound();
  const canManage = org.viewer.canManageMembers;
  const [members, invitations] = await Promise.all([
    serverFetch<MemberDto[]>(`/organizations/${slug}/members`),
    canManage ? serverFetch<InvitationDto[]>(`/organizations/${slug}/invitations`) : []
  ]);
  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">
          <Link href={`/organizations/${org.slug}`} className="underline underline-offset-2">
            {org.name}
          </Link>
        </p>
        <h1 className="display-lg mt-3">Team</h1>
        <p className="mt-4">
          <OrganizationBadge org={org} />
        </p>
        {org.verificationStatus !== "VERIFIED" && (
          <p className="mt-4 max-w-2xl text-muted">
            Until the organization is verified, nobody can be invited and nobody can publish
            responses for it.
          </p>
        )}
      </header>
      <div className="mt-10 max-w-4xl">
        <TeamManager
          slug={org.slug}
          orgName={org.name}
          members={members}
          invitations={invitations}
          canManage={canManage}
          selfUserId={user.id}
        />
      </div>
    </div>
  );
}
