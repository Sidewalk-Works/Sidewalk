import { ArrowRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { OwnerReportDto, OwnerUpdateDto, Paginated } from "@sidewalk/contracts";
import { ReportRow } from "@/components/report/report-row";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatNumber, timeAgo } from "@/lib/format";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "My reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Counts = Record<string, number>;
type Mine = Paginated<OwnerReportDto> & { counts: Counts };

const TABS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "CLOSED", label: "Closed" }
];

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const status = [
    "ALL",
    "OPEN",
    "CLOSED",
    "SUBMITTED",
    "UNDER_REVIEW",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "RESOLVED",
    "REOPENED",
    "REJECTED",
    "DUPLICATE"
  ].includes(sp.status ?? "")
    ? (sp.status as string)
    : "ALL";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [mine, everything, updates] = await Promise.all([
    serverFetch<Mine>(`/reports/mine?status=${status}&page=${page}&pageSize=10`),
    serverFetch<Mine>("/reports/mine?status=ALL&pageSize=50"),
    serverFetch<{ items: OwnerUpdateDto[] }>("/reports/mine/updates")
  ]);
  const needsAction = everything.items.filter((r) => r.actionNeeded);
  const counts = mine.counts;
  const href = (s: string, p = 1) =>
    `/dashboard?${new URLSearchParams({ ...(s !== "ALL" ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`.replace(
      /\?$/,
      ""
    );

  return (
    <div className="wrap py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Signed in as {user.displayName}</p>
          <h1 className="display-lg mt-2">My reports</h1>
        </div>
        <ButtonLink href="/report" icon={<Plus className="size-4" aria-hidden />}>
          Report an issue
        </ButtonLink>
      </header>

      {needsAction.length > 0 && (
        <section
          aria-labelledby="action"
          className="mt-10 border-2 border-laterite bg-laterite-wash/60 p-6"
        >
          <h2 id="action" className="font-sans text-xl font-bold tracking-tight">
            {needsAction.length === 1
              ? "One report needs your attention"
              : `${needsAction.length} reports need your attention`}
          </h2>
          <ul className="mt-4 divide-y divide-laterite/25">
            {needsAction.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/issues/${r.reference}`}
                    className="font-display text-[1.25rem] leading-tight underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-1 max-w-2xl text-[0.925rem]">{r.actionNeeded?.message}</p>
                </div>
                <Link
                  href={`/issues/${r.reference}`}
                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
                >
                  Open <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="list" className="min-w-0">
          <h2 id="list" className="sr-only">
            Your reports
          </h2>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={href(t.key)}
                aria-current={status === t.key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-2 px-4 font-semibold ${status === t.key ? "border-ink bg-ink text-paper" : "border-ink hover:bg-paper-deep"}`}
              >
                {t.label}
                <span
                  className={`text-[0.8rem] ${status === t.key ? "text-paper/70" : "text-muted"}`}
                >
                  {formatNumber(counts[t.key] ?? 0)}
                </span>
              </Link>
            ))}
            {!TABS.some((t) => t.key === status) && (
              <span
                className="inline-flex min-h-11 items-center border-2 border-ink bg-ink px-4 font-semibold text-paper"
                aria-current="page"
              >
                {status.replace("_", " ").toLowerCase()}
              </span>
            )}
          </nav>

          <div className="mt-6">
            {mine.items.length === 0 ? (
              <EmptyState
                title={
                  status === "ALL" ? "You have not reported anything yet." : "No reports here."
                }
                action={
                  status === "ALL" ? (
                    <ButtonLink href="/report">Report your first issue</ButtonLink>
                  ) : (
                    <ButtonLink href="/dashboard" variant="secondary">
                      Show all reports
                    </ButtonLink>
                  )
                }
              >
                {status === "ALL"
                  ? "When you file a report it appears here, with every update and anything that needs you to act."
                  : "Nothing matches that filter."}
              </EmptyState>
            ) : (
              <>
                {mine.items.map((r) => (
                  <div key={r.id} className="relative">
                    <ReportRow report={r} />
                    {r.canEdit && (
                      <div className="-mt-3 pb-5 sm:pl-0 md:pl-[8.5rem]">
                        <Link
                          href={`/dashboard/reports/${r.reference}/edit`}
                          className="relative z-10 text-[0.9rem] font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
                        >
                          Edit report
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-8">
                  <Pagination
                    page={mine.page}
                    totalPages={mine.totalPages}
                    hrefFor={(p) => href(status, p)}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <aside aria-labelledby="updates" className="self-start">
          <h2 id="updates" className="eyebrow">
            Recent updates
          </h2>
          {updates.items.length === 0 ? (
            <p className="mt-4 border-t-2 border-ink pt-4 text-[0.95rem] text-muted">
              Nothing new yet. When staff or neighbours act on your reports, it shows up here.
            </p>
          ) : (
            <ul className="mt-4 border-t-2 border-ink">
              {updates.items.map((u) => (
                <li key={u.id} className="border-b border-rule py-3.5">
                  <p className="text-[0.95rem]">
                    <strong>{u.actorLabel}</strong>: {u.summary.toLowerCase()}
                  </p>
                  <Link
                    href={`/issues/${u.report.reference}`}
                    className="mt-0.5 block text-[0.95rem] underline decoration-rule underline-offset-2 hover:decoration-ink"
                  >
                    {u.report.title}
                  </Link>
                  <p className="mt-1 text-[0.8rem] text-muted">{timeAgo(u.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-8 border-t-2 border-ink pt-4 text-[0.9rem]">
            <Link href="/account" className="link font-semibold">
              Account settings
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
