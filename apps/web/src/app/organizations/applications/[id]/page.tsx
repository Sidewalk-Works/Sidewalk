import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  APPLICATION_STATUS_INFO,
  ORGANIZATION_TYPE_INFO,
  ADMINISTRATIVE_LEVEL_INFO,
  type ApplicationDto
} from "@sidewalk/contracts";
import { ApplicationDocuments } from "@/components/organizations/application-documents";
import { ApplicationEditor } from "@/components/organizations/application-editor";
import { WithdrawApplication } from "@/components/organizations/withdraw-application";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireUser(`/organizations/applications/${id}`);
  const app = await serverFetch<ApplicationDto>(`/organization-applications/${id}`);
  const info = APPLICATION_STATUS_INFO[app.status];
  const org = app.organization;

  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">Application</p>
        <h1 className="display-lg mt-3">{org.name}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex border-2 border-ink px-3 py-1 text-[0.85rem] font-bold">
            {info.label}
          </span>
          <span className="text-muted">{info.meaning}</span>
        </p>
        <p className="mt-3 text-[0.875rem] text-muted">
          Started {formatDateTime(app.createdAt)}
          {app.submittedAt && <> · Sent {formatDateTime(app.submittedAt)}</>}
          {app.decidedAt && <> · Decided {formatDateTime(app.decidedAt)}</>}
        </p>
      </header>

      <div className="mt-10 max-w-3xl space-y-10">
        {app.status === "INFO_REQUESTED" && app.infoRequest && (
          <Alert tone="warn" title="Sidewalk staff asked you a question">
            <span className="whitespace-pre-line">{app.infoRequest}</span>
            <span className="mt-2 block">
              Update the application or add documents below, then send it again.
            </span>
          </Alert>
        )}
        {app.status === "APPROVED" && (
          <Alert tone="success" title="Approved">
            {app.decisionReason}{" "}
            <Link
              href={`/organizations/${org.slug}`}
              className="font-semibold underline underline-offset-2"
            >
              Open the organization’s profile
            </Link>
          </Alert>
        )}
        {app.status === "REJECTED" && (
          <Alert tone="error" title="Not approved">
            {app.decisionReason}
            <span className="mt-2 block">
              The decision is final for this application. If your circumstances change you can start
              a new one.
            </span>
          </Alert>
        )}

        {app.can.edit ? (
          <ApplicationEditor application={app} />
        ) : (
          <section aria-labelledby="summary" className="space-y-6">
            <h2 id="summary" className="display-md">
              What you sent
            </h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Item label="Kind">
                {ORGANIZATION_TYPE_INFO[org.type].label} ·{" "}
                {ADMINISTRATIVE_LEVEL_INFO[org.level].label}
              </Item>
              <Item label="Authority">{org.jurisdiction}</Item>
              {org.description && <Item label="What it does">{org.description}</Item>}
              {app.roleTitle && <Item label="Your role">{app.roleTitle}</Item>}
              {app.authorityStatement && (
                <Item label="Why you may speak for it">{app.authorityStatement}</Item>
              )}
            </dl>
            {app.officialReferences.length > 0 && (
              <div>
                <h3 className="font-sans text-lg font-bold">References</h3>
                <ul className="mt-2 space-y-2">
                  {app.officialReferences.map((r, i) => (
                    <li key={i}>
                      <strong>{r.kind}</strong>: {r.label} — {r.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <ApplicationDocuments
          applicationId={app.id}
          documents={app.documents}
          canEdit={app.can.addDocuments}
        />

        {app.can.withdraw && (
          <div className="border-t-2 border-ink pt-6">
            <WithdrawApplication id={app.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.85rem] text-muted">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}
