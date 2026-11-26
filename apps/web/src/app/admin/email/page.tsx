import clsx from "clsx";
import Link from "next/link";
import type { Paginated } from "@sidewalk/contracts";
import { RetryEmailButton } from "@/components/admin/email-retry";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { requireAdmin, serverFetch } from "@/lib/server-api";

interface Row {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  to: string;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
}

interface Health {
  oldestPendingAgeSeconds: number;
  keyBlocked: number;
  activeKeyId: string;
  configuredKeyIds: string[];
  messagesByKey: Record<string, number>;
  rateLimit: { store: "ok" | "degraded"; fallbackHits: number };
}

/** Waiting longer than this for a due message to be picked up means the worker is not running. */
const STALLED_SECONDS = 120;

/** What an operator should read for a message, in words: internal failure codes are translated. */
function describe(r: Row): string {
  const reason = r.lastError ?? "";
  const key = /^key_unavailable: key "([^"]+)"/.exec(reason);
  if (key)
    return `Held: the encryption key “${key[1]}” is not configured. It is kept and retried; nothing is lost.${r.status === "FAILED" ? ` Next check ${formatDateTime(r.nextAttemptAt)}.` : ""}`;
  if (r.status === "SENT" && r.sentAt) return `Sent ${formatDateTime(r.sentAt)}`;
  if (r.status === "FAILED") return `Next try ${formatDateTime(r.nextAttemptAt)}. ${reason}`;
  return reason;
}

const STATUSES = ["ALL", "FAILED", "DEAD", "PENDING", "SENDING", "SENT", "SKIPPED"];
const MEANING: Record<string, string> = {
  PENDING: "Waiting for the worker",
  SENDING: "Being sent now",
  SENT: "Accepted by the mail provider",
  FAILED: "A try failed; another is scheduled",
  DEAD: "Gave up. Needs attention",
  SKIPPED: "No longer appropriate to send"
};

export default async function EmailDeliveryPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin("/admin/email");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status as string) : "ALL";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await serverFetch<
    Paginated<Row> & { summary: Record<string, number>; health: Health }
  >(`/admin/email-outbox?status=${status}&page=${page}&pageSize=20`);
  const href = (s: string, p = 1) => `/admin/email?status=${s}${p > 1 ? `&page=${p}` : ""}`;
  const attention = (data.summary.DEAD ?? 0) + (data.summary.FAILED ?? 0);

  return (
    <section aria-labelledby="email">
      <h2 id="email" className="display-md">
        Email delivery
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        Every email the platform sends is queued here first and delivered by a worker. A message
        counts as sent only after the mail provider accepts it. Addresses are partly hidden; message
        content never appears.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t-2 border-ink pt-5 sm:grid-cols-3 lg:grid-cols-6">
        {["PENDING", "SENDING", "SENT", "FAILED", "DEAD", "SKIPPED"].map((s) => (
          <div key={s}>
            <dt className="text-[0.8rem] font-bold uppercase tracking-wider text-muted">
              {s.toLowerCase()}
            </dt>
            <dd>
              <span
                className={clsx(
                  "block font-display text-[2.4rem] leading-none [font-variant-numeric:lining-nums]",
                  (s === "DEAD" || s === "FAILED") && (data.summary[s] ?? 0) > 0 && "text-danger"
                )}
              >
                {data.summary[s] ?? 0}
              </span>
              <span className="mt-1 block text-[0.78rem] text-muted">{MEANING[s]}</span>
            </dd>
          </div>
        ))}
      </dl>
      {data.health.oldestPendingAgeSeconds > STALLED_SECONDS && (
        <p
          role="status"
          className="mt-6 border-l-4 border-danger bg-danger-wash px-4 py-3 text-[0.95rem] font-medium"
        >
          The oldest message has been due for {Math.round(data.health.oldestPendingAgeSeconds / 60)}{" "}
          minutes. The delivery worker may have stopped: check that it is running.
        </p>
      )}
      {data.health.keyBlocked > 0 && (
        <p
          role="status"
          className="mt-6 border-l-4 border-danger bg-danger-wash px-4 py-3 text-[0.95rem] font-medium"
        >
          {data.health.keyBlocked} message{data.health.keyBlocked === 1 ? " is" : "s are"} being
          held because the encryption key{" "}
          {data.health.keyBlocked === 1 ? "it needs is" : "they need are"} not configured. Nothing
          is lost: restore the key and delivery resumes.
        </p>
      )}
      {data.health.rateLimit.store === "degraded" && (
        <p
          role="status"
          className="mt-6 border-l-4 border-danger bg-danger-wash px-4 py-3 text-[0.95rem] font-medium"
        >
          The shared rate-limit store has been unreachable. Limits are still enforced, but only per
          server, until it recovers.
        </p>
      )}
      <p className="mt-6 text-[0.85rem] text-muted">
        Queued messages are encrypted with key “{data.health.activeKeyId}”.{" "}
        {Object.keys(data.health.messagesByKey).length === 0
          ? "None is queued right now."
          : Object.entries(data.health.messagesByKey)
              .map(
                ([id, n]) =>
                  `${n} still queued under ${id === "legacy" ? "the legacy key" : `“${id}”`}`
              )
              .join(", ") + "."}
      </p>
      {attention > 0 && (
        <p
          role="status"
          className="mt-6 border-l-4 border-danger bg-danger-wash px-4 py-3 text-[0.95rem] font-medium"
        >
          {attention} message{attention === 1 ? "" : "s"} failed or gave up. Check the mail provider
          settings, then retry them below.
        </p>
      )}

      <nav aria-label="Filter by delivery state" className="mt-8 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href(s)}
            aria-current={status === s ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
              status === s ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>

      {/* Small screens: one card per message, so the Retry button is never off to the side. */}
      <ul aria-label="Queued and delivered email" className="mt-6 border-t-2 border-ink md:hidden">
        {data.items.map((r) => (
          <li key={r.id} className="space-y-1.5 border-b border-rule py-4 text-[0.9rem]">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-mono text-[0.78rem]">{r.kind.toLowerCase()}</span>
              <span className="text-[0.78rem] text-muted">{formatDateTime(r.createdAt)}</span>
            </p>
            <p className="font-mono text-[0.8rem] [overflow-wrap:anywhere]">{r.to}</p>
            <p>
              <span
                className={clsx(
                  "font-semibold",
                  (r.status === "DEAD" || r.status === "FAILED") && "text-danger"
                )}
              >
                {r.status.toLowerCase()}
              </span>
              <span className="text-[0.75rem] text-muted">
                {" "}
                · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
              </span>
            </p>
            {describe(r) && (
              <p className="text-[0.8rem] text-muted [overflow-wrap:anywhere]">{describe(r)}</p>
            )}
            {(r.status === "DEAD" || r.status === "FAILED") && (
              <div className="pt-1">
                <RetryEmailButton id={r.id} label={`${r.kind.toLowerCase()} email to ${r.to}`} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div
        className="relative mt-6 hidden overflow-x-auto md:block"
        role="region"
        aria-label="Queued and delivered email"
        tabIndex={0}
      >
        <table className="w-full min-w-[46rem] border-t-2 border-ink text-left">
          <caption className="sr-only">Queued and delivered email, newest first</caption>
          <thead>
            <tr className="border-b border-rule text-[0.8rem] uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4">
                Queued
              </th>
              <th scope="col" className="py-3 pr-4">
                Kind
              </th>
              <th scope="col" className="py-3 pr-4">
                To
              </th>
              <th scope="col" className="py-3 pr-4">
                State
              </th>
              <th scope="col" className="py-3 pr-4">
                Detail
              </th>
              <th scope="col" className="py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="border-b border-rule align-top text-[0.9rem]">
                <td className="whitespace-nowrap py-3.5 pr-4">{formatDateTime(r.createdAt)}</td>
                <td className="py-3.5 pr-4 font-mono text-[0.78rem]">{r.kind.toLowerCase()}</td>
                <td className="py-3.5 pr-4 font-mono text-[0.8rem] [overflow-wrap:anywhere]">
                  {r.to}
                </td>
                <td className="py-3.5 pr-4">
                  <span
                    className={clsx(
                      "font-semibold",
                      (r.status === "DEAD" || r.status === "FAILED") && "text-danger"
                    )}
                  >
                    {r.status.toLowerCase()}
                  </span>
                  <span className="block text-[0.75rem] text-muted">
                    {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="max-w-xs py-3.5 pr-4 text-[0.8rem] text-muted [overflow-wrap:anywhere]">
                  {describe(r)}
                </td>
                <td className="py-3.5 text-right">
                  {(r.status === "DEAD" || r.status === "FAILED") && (
                    <RetryEmailButton
                      id={r.id}
                      label={`${r.kind.toLowerCase()} email to ${r.to}`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.items.length === 0 && <p className="py-8 text-muted">No messages in this state.</p>}
      <div className="mt-8">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(p) => href(status, p)}
        />
      </div>
    </section>
  );
}
