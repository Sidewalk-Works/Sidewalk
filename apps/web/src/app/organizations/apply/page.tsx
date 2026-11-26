import type { Metadata } from "next";
import Link from "next/link";
import type { OrganizationProfileDto } from "@sidewalk/contracts";
import { ApplicationEditor } from "@/components/organizations/application-editor";
import { Alert } from "@/components/ui/alert";
import { requireVerifiedUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Apply to represent an organization",
  robots: { index: false }
};

export default async function ApplyPage({
  searchParams
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const sp = await searchParams;
  const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sp.organization ?? "") ? sp.organization : undefined;
  await requireVerifiedUser(`/organizations/apply${slug ? `?organization=${slug}` : ""}`);
  const existing = slug
    ? await serverFetch<OrganizationProfileDto>(`/organizations/${slug}`)
    : undefined;

  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">Organizations</p>
        <h1 className="display-lg mt-3">Apply to represent an organization</h1>
        <p className="mt-5 text-[1.2rem] leading-relaxed text-ink-soft">
          Public institutions can answer reports on Sidewalk once Sidewalk staff have checked who
          they are. Applying does not make an organization verified, and neither does an invitation
          or a work email address. A staff member reviews each application against sources they can
          check themselves.
        </p>
      </header>
      <div className="mt-10 max-w-3xl space-y-8">
        <Alert tone="info" title="What happens next">
          You save a draft, add references and documents, then send it. Staff may ask questions. You
          are told the outcome, with the reason. Until approved, the organization cannot post
          official responses. See{" "}
          <Link href="/accountability" className="font-semibold underline underline-offset-2">
            how accountability works on Sidewalk
          </Link>
          .
        </Alert>
        {existing && (
          <Alert tone="info" title={`Applying for ${existing.name}`}>
            This organization already has a profile that is not verified. Your application is to
            represent it.
          </Alert>
        )}
        <ApplicationEditor
          application={null}
          existing={existing ? { slug: existing.slug, name: existing.name } : undefined}
        />
      </div>
    </div>
  );
}
