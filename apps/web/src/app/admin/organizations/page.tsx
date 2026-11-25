import clsx from "clsx";
import Link from "next/link";
import {
  APPLICATION_STATUS_INFO,
  ORGANIZATION_TYPE_INFO,
  type ApplicationQueueItemDto,
  type Paginated
} from "@sidewalk/contracts";
import { CreateOrganization } from "@/components/admin/create-organization";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

const TABS = [
  { key: "OPEN", label: "Waiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Not approved" },
  { key: "ALL", label: "All" }
];

export default async function ApplicationQueuePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "OPEN";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [data, user] = await Promise.all([
    serverFetch<Paginated<ApplicationQueueItemDto>>(
      `/moderation/organization-applications?status=${status}&page=${page}&pageSize=15`
    ),
    getSession()
  ]);
  const href = (s: string, p = 1) => `/admin/organizations?status=${s}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <section aria-labelledby="queue" className="space-y-6">
      <h3 id="queue" className="sr-only">
        Applications
      </h3>
      {user?.role === "ADMIN" && <CreateOrganization />}
      <nav aria-label="Application status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={status === t.key ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
              status === t.key ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="text-muted" aria-live="polite">
        {data.total} application{data.total === 1 ? "" : "s"}
      </p>
      {data.items.length === 0 ? (
        <EmptyState title="No applications here.">
          Applications appear when someone sends one for review.
        </EmptyState>
      ) : (
        <ul className="border-t-2 border-ink">
          {data.items.map((a) => (
            <li key={a.id} className="grid gap-2 border-b border-rule py-5 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="font-display text-[1.35rem] leading-tight">
                  <Link
                    href={`/admin/organizations/applications/${a.id}`}
                    className="underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {a.organizationName}
                  </Link>
                </p>
                <p className="mt-1 text-[0.9rem] text-muted">
                  {ORGANIZATION_TYPE_INFO[a.type].label} · {a.jurisdiction} · applicant{" "}
                  {a.applicantName}
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  {a.submittedAt ? `Sent ${formatDateTime(a.submittedAt)}` : "Not sent"} ·{" "}
                  {a.documents} document{a.documents === 1 ? "" : "s"}
                  {a.reviewerName && <> · reviewer {a.reviewerName}</>}
                </p>
                {a.similarCount > 0 && (
                  <p className="mt-1 text-[0.85rem] font-semibold text-signal">
                    {a.similarCount} other organization{a.similarCount === 1 ? "" : "s"} with a
                    similar name: look closely.
                  </p>
                )}
              </div>
              <p className="self-start border-2 border-ink px-3 py-1 text-[0.85rem] font-bold">
                {APPLICATION_STATUS_INFO[a.status].label}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(status, p)} />
    </section>
  );
}
