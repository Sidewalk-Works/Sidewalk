import { notFound } from "next/navigation";
import {
  ADMINISTRATIVE_LEVEL_INFO,
  APPLICATION_STATUS_INFO,
  ORGANIZATION_TYPE_INFO,
  ORG_VERIFICATION_INFO,
  type StaffApplicationDto
} from "@sidewalk/contracts";
import Link from "next/link";
import { ApplicationReview } from "@/components/admin/application-review";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

export default async function StaffApplicationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [app, user] = await Promise.all([
    serverFetch<StaffApplicationDto>(`/moderation/organization-applications/${id}`),
    getSession()
  ]);
  const o = app.organization;
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_24rem]">
      <div className="min-w-0 space-y-10">
        <header>
          <p className="eyebrow">Application · {APPLICATION_STATUS_INFO[app.status].label}</p>
          <h3 className="display-md mt-2">{o.name}</h3>
          <p className="mt-2 text-[0.9rem] text-muted">
            {ORGANIZATION_TYPE_INFO[o.type].label} · {ADMINISTRATIVE_LEVEL_INFO[o.level].label} ·{" "}
            {o.jurisdiction}
          </p>
          <p className="mt-1 text-[0.85rem] text-muted">
            Currently: {ORG_VERIFICATION_INFO[o.verificationStatus].label}
            {app.submittedAt && <> · sent {formatDateTime(app.submittedAt)}</>}
          </p>
        </header>

        {app.similar.length > 0 && (
          <Alert tone="warn" title="Other organizations with the same or a similar name">
            A similar name is a reason to look closer, never proof of anything.
            <ul className="mt-2 list-disc pl-5">
              {app.similar.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/organizations/${s.slug}`}
                    className="font-semibold underline underline-offset-2"
                  >
                    {s.name}
                  </Link>{" "}
                  — {ORG_VERIFICATION_INFO[s.verificationStatus].label}, {s.jurisdiction}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <section aria-labelledby="applicant">
          <h4 id="applicant" className="eyebrow">
            Applicant
          </h4>
          <p className="mt-2 font-semibold">{app.applicant.name}</p>
          <p className="text-[0.9rem]">
            {app.applicant.email}{" "}
            <span className="text-muted">
              ({app.applicant.emailVerified ? "address confirmed" : "address not confirmed"}). A
              confirmed address proves control of a mailbox, not authority over an institution.
            </span>
          </p>
          {app.roleTitle && <p className="mt-2">Role claimed: {app.roleTitle}</p>}
          {app.authorityStatement && (
            <blockquote className="mt-3 max-w-2xl border-l-4 border-ink bg-paper-deep px-4 py-3 whitespace-pre-line">
              {app.authorityStatement}
            </blockquote>
          )}
        </section>

        <section aria-labelledby="inst">
          <h4 id="inst" className="eyebrow">
            What they say about the institution
          </h4>
          {o.description && <p className="mt-2 max-w-2xl whitespace-pre-line">{o.description}</p>}
          <dl className="mt-3 grid gap-3 text-[0.925rem] sm:grid-cols-2">
            {o.aliases.length > 0 && <Row label="Also known as">{o.aliases.join(", ")}</Row>}
            {o.serviceAreas.length > 0 && (
              <Row label="Areas served">{o.serviceAreas.join(", ")}</Row>
            )}
            {o.parentSlug && <Row label="Part of">{o.parentSlug}</Row>}
            {o.website && <Row label="Website">{o.website}</Row>}
            {o.publicEmail && <Row label="Public email">{o.publicEmail}</Row>}
            {o.publicPhone && <Row label="Public phone">{o.publicPhone}</Row>}
          </dl>
        </section>

        <section aria-labelledby="refs">
          <h4 id="refs" className="eyebrow">
            References to check
          </h4>
          {app.officialReferences.length === 0 ? (
            <p className="mt-2 text-muted">None given.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {app.officialReferences.map((r, i) => (
                <li key={i}>
                  <strong>{r.kind}</strong>: {r.label} —{" "}
                  <span className="break-all">{r.value}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 max-w-2xl text-[0.85rem] text-muted">
            Check these yourself, in an independent source. Do not use a contact detail supplied by
            the applicant to confirm the applicant.
          </p>
        </section>

        <section aria-labelledby="docs">
          <h4 id="docs" className="eyebrow">
            Private documents ({app.documents.length})
          </h4>
          {app.documents.length === 0 ? (
            <p className="mt-2 text-muted">None attached.</p>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2">
              {app.documents.map((d, i) => (
                <li key={d.id} className="border border-rule bg-surface">
                  <a href={d.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.url}
                      alt={d.caption ?? `Document ${i + 1}`}
                      width={d.width}
                      height={d.height}
                      className="aspect-[4/3] w-full bg-paper-deep object-contain"
                    />
                  </a>
                  <p className="px-3 py-2 text-[0.85rem]">{d.caption ?? `Document ${i + 1}`}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(app.infoRequest || app.decisionReason) && (
          <section aria-labelledby="said">
            <h4 id="said" className="eyebrow">
              What the applicant has been told
            </h4>
            {app.infoRequest && (
              <p className="mt-2 whitespace-pre-line">Question: {app.infoRequest}</p>
            )}
            {app.decisionReason && (
              <p className="mt-2 whitespace-pre-line">
                Decision{app.reviewer ? ` by ${app.reviewer.name}` : ""}: {app.decisionReason}
              </p>
            )}
          </section>
        )}
      </div>
      <aside aria-label="Review actions">
        <ApplicationReview app={app} isAdmin={user?.role === "ADMIN"} />
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
