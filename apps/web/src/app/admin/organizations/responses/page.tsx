import clsx from "clsx";
import Link from "next/link";
import {
  RESPONSE_TYPES,
  RESPONSE_TYPE_INFO,
  type OfficialResponseDto,
  type Paginated
} from "@sidewalk/contracts";
import { ModerateButton } from "@/components/admin/moderation-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

const STATES = ["ALL", "VISIBLE", "HIDDEN", "REMOVED"];

export default async function ResponsesAdminPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string; type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const state = STATES.includes(sp.state ?? "") ? (sp.state as string) : "ALL";
  const type = (RESPONSE_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as string)
    : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [data, user] = await Promise.all([
    serverFetch<Paginated<OfficialResponseDto>>(
      `/moderation/official-responses?state=${state}${type ? `&type=${type}` : ""}&page=${page}&pageSize=15`
    ),
    getSession()
  ]);
  const href = (s: string, p = 1) =>
    `/admin/organizations/responses?state=${s}${type ? `&type=${type}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <section aria-labelledby="resp" className="space-y-6">
      <h3 id="resp" className="sr-only">
        Official responses
      </h3>
      <nav aria-label="Visibility" className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <Link
            key={s}
            href={href(s)}
            aria-current={state === s ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
              state === s ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <EmptyState title="No official responses here." />
      ) : (
        <ul className="border-t-2 border-ink">
          {data.items.map((r) => (
            <li key={r.id} className="grid gap-3 border-b border-rule py-5 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="eyebrow">
                  {RESPONSE_TYPE_INFO[r.type].label} · {r.organization.name} ·{" "}
                  {(r.moderationState ?? "VISIBLE").toLowerCase()}
                </p>
                <p className="mt-2 max-w-2xl whitespace-pre-line">{r.body}</p>
                <p className="mt-2 text-[0.8125rem] text-muted">
                  {r.authorName} · {formatDateTime(r.createdAt)}
                  {r.report && (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        href={`/issues/${r.report.reference}`}
                        className="underline underline-offset-2"
                      >
                        {r.report.title}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div>
                <ModerateButton
                  endpoint={`/moderation/official-responses/${r.id}/actions`}
                  subject="statement"
                  state={r.moderationState ?? "VISIBLE"}
                  isAdmin={user?.role === "ADMIN"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(state, p)} />
    </section>
  );
}
