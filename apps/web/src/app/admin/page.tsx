import clsx from "clsx";
import Link from "next/link";
import { FLAG_REASON_LABELS, type FlagDto, type Paginated } from "@sidewalk/contracts";
import { DismissFlagButton, ModerateButton } from "@/components/admin/moderation-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

const TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ACTIONED", label: "Actioned" },
  { key: "DISMISSED", label: "Dismissed" },
  { key: "ALL", label: "All" }
];

export default async function FlagQueuePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as string) : "OPEN";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [flags, user] = await Promise.all([
    serverFetch<Paginated<FlagDto>>(`/moderation/flags?status=${status}&page=${page}&pageSize=15`),
    getSession()
  ]);
  const isAdmin = user?.role === "ADMIN";
  const href = (s: string, p = 1) => `/admin?status=${s}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <section aria-labelledby="queue">
      <h2 id="queue" className="sr-only">
        Flag queue
      </h2>
      <nav aria-label="Flag status" className="flex flex-wrap gap-2">
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
      <p className="mt-4 text-muted" aria-live="polite">
        {flags.total} {status === "ALL" ? "" : status.toLowerCase()} flag
        {flags.total === 1 ? "" : "s"}
      </p>

      {flags.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={status === "OPEN" ? "The queue is clear." : "No flags here."}>
            {status === "OPEN"
              ? "No residents have flagged content that still needs a decision."
              : "Nothing matches this filter."}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-4 border-t-2 border-ink">
          {flags.items.map((f) => {
            const isComment = f.target === "COMMENT" && f.comment;
            const isResponse = f.target === "OFFICIAL_RESPONSE" && f.response;
            const endpoint = isComment
              ? `/moderation/comments/${f.comment?.id}/actions`
              : isResponse
                ? `/moderation/official-responses/${f.response?.id}/actions`
                : `/moderation/reports/${f.report.reference}/actions`;
            const state = isComment
              ? (f.comment?.moderationState ?? "VISIBLE")
              : isResponse
                ? (f.response?.moderationState ?? "VISIBLE")
                : f.report.moderationState;
            return (
              <li
                key={f.id}
                className="grid gap-4 border-b border-rule py-6 lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="eyebrow flex flex-wrap gap-x-3">
                    <span>
                      {isComment ? "Comment" : isResponse ? "Official response" : "Report"}
                    </span>
                    <span>{FLAG_REASON_LABELS[f.reason]}</span>
                    <span className={clsx(f.status === "OPEN" ? "text-laterite" : "text-muted")}>
                      {f.status}
                    </span>
                  </p>
                  <p className="mt-2 font-display text-[1.35rem] leading-tight">
                    <Link
                      href={`/issues/${f.report.reference}`}
                      className="underline decoration-laterite decoration-2 underline-offset-4"
                    >
                      {f.report.title}
                    </Link>
                  </p>
                  {isComment && f.comment && (
                    <blockquote className="mt-3 max-w-2xl border-l-4 border-ink bg-paper-deep px-4 py-3 text-[0.95rem]">
                      <p className="whitespace-pre-line">{f.comment.body}</p>
                      <footer className="mt-1 text-[0.8rem] text-muted">
                        By {f.comment.authorName}
                      </footer>
                    </blockquote>
                  )}
                  {isResponse && f.response && (
                    <blockquote className="mt-3 max-w-2xl border-l-4 border-ink bg-paper-deep px-4 py-3 text-[0.95rem]">
                      <p className="whitespace-pre-line">{f.response.body}</p>
                      <footer className="mt-1 text-[0.8rem] text-muted">
                        {f.response.type.toLowerCase().replace("_", " ")} by {f.response.authorName}{" "}
                        for {f.response.organizationName}
                      </footer>
                    </blockquote>
                  )}
                  {f.details && (
                    <p className="mt-3 max-w-2xl text-[0.95rem]">Flagged with: “{f.details}”</p>
                  )}
                  <p className="mt-2 text-[0.8125rem] text-muted">
                    Flagged by {f.reporterName} · {formatDateTime(f.createdAt)} · currently{" "}
                    {state.toLowerCase()}
                  </p>
                </div>
                {f.status === "OPEN" && (
                  <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                    <ModerateButton
                      endpoint={endpoint}
                      subject={isComment ? "comment" : isResponse ? "statement" : "report"}
                      state={state}
                      isAdmin={isAdmin}
                      label="Review and decide"
                    />
                    <DismissFlagButton flagId={f.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-8">
        <Pagination
          page={flags.page}
          totalPages={flags.totalPages}
          hrefFor={(p) => href(status, p)}
        />
      </div>
    </section>
  );
}
