import clsx from "clsx";
import Link from "next/link";
import {
  RELATION_BASIS_INFO,
  RELATION_STATUS_INFO,
  STATUS_INFO,
  type Paginated,
  type RelationQueueItemDto
} from "@sidewalk/contracts";
import { OrganizationLabel } from "@/components/organizations/org-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/format";
import { serverFetch } from "@/lib/server-api";

const TABS = [
  { key: "OUTSIDE_REMIT", label: "Says outside its remit" },
  { key: "PROPOSED", label: "Suggested, no response" }
];

export default async function RelationsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "OUTSIDE_REMIT";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<RelationQueueItemDto>>(
    `/moderation/organization-relations?status=${status}&page=${page}&pageSize=15`
  );
  const href = (s: string, p = 1) =>
    `/admin/organizations/relations?status=${s}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <section aria-labelledby="rel" className="space-y-6">
      <h3 id="rel" className="sr-only">
        Connections to review
      </h3>
      <p className="max-w-2xl text-muted">
        Who is responsible for a report is a judgement for a person. “Outside its remit” is the
        organization’s own statement, not a finding. Open the report to connect a different
        organization or confirm one.
      </p>
      <nav aria-label="Connection state" className="flex flex-wrap gap-2">
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
      {data.items.length === 0 ? (
        <EmptyState title="Nothing to review." />
      ) : (
        <ul className="border-t-2 border-ink">
          {data.items.map((r) => (
            <li key={r.id} className="border-b border-rule py-5">
              <p className="font-display text-[1.3rem] leading-tight">
                <Link
                  href={`/issues/${r.report.reference}`}
                  className="underline decoration-laterite decoration-2 underline-offset-4"
                >
                  {r.report.title}
                </Link>
              </p>
              <p className="mt-1 text-[0.85rem] text-muted">
                {r.report.reference} · {STATUS_INFO[r.report.status].label}
              </p>
              <p className="mt-2">
                <OrganizationLabel org={r.organization} />
              </p>
              <p className="mt-1 text-[0.875rem] text-muted">
                {RELATION_BASIS_INFO[r.basis].label} · {RELATION_STATUS_INFO[r.status].label} ·{" "}
                {formatDate(r.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(status, p)} />
    </section>
  );
}
