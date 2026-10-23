import clsx from "clsx";
import Link from "next/link";
import type { ModerationState, Paginated, ReportStatus } from "@sidewalk/contracts";
import { ModerateButton } from "@/components/admin/moderation-actions";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

interface Row {
  reference: string;
  title: string;
  status: ReportStatus;
  moderationState: ModerationState;
  createdAt: string;
  reporterName: string;
  openFlags: number;
}

const TABS = ["ALL", "VISIBLE", "HIDDEN", "REMOVED"];

export default async function AdminReportsPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const state = TABS.includes(sp.state ?? "") ? (sp.state as string) : "ALL";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").slice(0, 100);
  const [data, user] = await Promise.all([
    serverFetch<Paginated<Row>>(
      `/moderation/reports?state=${state}&page=${page}&pageSize=15&q=${encodeURIComponent(q)}`
    ),
    getSession()
  ]);
  const href = (s: string, p = 1) =>
    `/admin/reports?state=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <section aria-labelledby="reports">
      <h2 id="reports" className="sr-only">
        All reports
      </h2>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Visibility" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t}
              href={href(t)}
              aria-current={state === t ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
                state === t ? "bg-ink text-paper" : "hover:bg-paper-deep"
              )}
            >
              {t === "ALL" ? "All" : t[0] + t.slice(1).toLowerCase()}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          <input type="hidden" name="state" value={state} />
          <label htmlFor="rq" className="sr-only">
            Search reports
          </label>
          <input
            id="rq"
            name="q"
            defaultValue={q}
            placeholder="Title or reference"
            className="min-h-11 border-2 border-ink/70 bg-surface px-3"
          />
          <button className="min-h-11 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper">
            Search
          </button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-t-2 border-ink text-left">
          <caption className="sr-only">Reports with their visibility and flags</caption>
          <thead>
            <tr className="border-b border-rule text-[0.8rem] uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4 font-bold">
                Report
              </th>
              <th scope="col" className="py-3 pr-4 font-bold">
                Status
              </th>
              <th scope="col" className="py-3 pr-4 font-bold">
                Visibility
              </th>
              <th scope="col" className="py-3 pr-4 font-bold">
                Open flags
              </th>
              <th scope="col" className="py-3 font-bold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.reference} className="border-b border-rule align-top">
                <td className="py-4 pr-4">
                  <Link
                    href={`/issues/${r.reference}`}
                    className="font-semibold underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-0.5 font-mono text-[0.78rem] text-muted">
                    {r.reference} · {formatDate(r.createdAt)} · {r.reporterName}
                  </p>
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-4 pr-4">
                  <span
                    className={clsx(
                      "font-semibold",
                      r.moderationState !== "VISIBLE" && "text-danger"
                    )}
                  >
                    {r.moderationState.toLowerCase()}
                  </span>
                </td>
                <td className="py-4 pr-4">{r.openFlags}</td>
                <td className="py-4 text-right">
                  <ModerateButton
                    endpoint={`/moderation/reports/${r.reference}/actions`}
                    subject="report"
                    state={r.moderationState}
                    isAdmin={user?.role === "ADMIN"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <p className="py-8 text-muted">No reports match.</p>}
      </div>
      <div className="mt-8">
        <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(state, p)} />
      </div>
    </section>
  );
}
