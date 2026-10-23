import clsx from "clsx";
import Link from "next/link";
import type { ModerationState, Paginated } from "@sidewalk/contracts";
import { ModerateButton } from "@/components/admin/moderation-actions";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

interface Row {
  id: string;
  excerpt: string;
  kind: string;
  moderationState: ModerationState;
  createdAt: string;
  authorName: string;
  report: { reference: string; title: string };
}

const TABS = ["ALL", "VISIBLE", "HIDDEN", "REMOVED"];

export default async function AdminCommentsPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const state = TABS.includes(sp.state ?? "") ? (sp.state as string) : "ALL";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [data, user] = await Promise.all([
    serverFetch<Paginated<Row>>(`/moderation/comments?state=${state}&page=${page}&pageSize=15`),
    getSession()
  ]);
  const href = (s: string, p = 1) => `/admin/comments?state=${s}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <section aria-labelledby="comments">
      <h2 id="comments" className="sr-only">
        All comments
      </h2>
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
      <ul className="mt-6 border-t-2 border-ink">
        {data.items.map((c) => (
          <li key={c.id} className="grid gap-3 border-b border-rule py-5 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="whitespace-pre-line">{c.excerpt}</p>
              <p className="mt-2 text-[0.8125rem] text-muted">
                {c.authorName}
                {c.kind === "STAFF" && " (staff update)"} · {formatDateTime(c.createdAt)} · on{" "}
                <Link href={`/issues/${c.report.reference}#comment-${c.id}`} className="underline">
                  {c.report.title}
                </Link>{" "}
                ·{" "}
                <span
                  className={clsx(
                    "font-semibold",
                    c.moderationState !== "VISIBLE" && "text-danger"
                  )}
                >
                  {c.moderationState.toLowerCase()}
                </span>
              </p>
            </div>
            <ModerateButton
              endpoint={`/moderation/comments/${c.id}/actions`}
              subject="comment"
              state={c.moderationState}
              isAdmin={user?.role === "ADMIN"}
            />
          </li>
        ))}
      </ul>
      {data.items.length === 0 && <p className="py-8 text-muted">No comments match.</p>}
      <div className="mt-8">
        <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(state, p)} />
      </div>
    </section>
  );
}
