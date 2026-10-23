import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import type { NotificationDto, Paginated } from "@sidewalk/contracts";
import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { NotificationItem } from "@/components/notifications/notification-item";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireUser("/notifications");
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<NotificationDto> & { unread: number }>(
    `/notifications?page=${page}&pageSize=15&unread=${unreadOnly}`
  );
  const href = (filter: string, p = 1) =>
    `/notifications?${new URLSearchParams({ ...(filter === "unread" ? { filter } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`.replace(
      /\?$/,
      ""
    );

  return (
    <div className="wrap py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">What has changed</p>
          <h1 className="display-lg mt-2">Notifications</h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            Updates on reports you filed or follow, and decisions about your own comments and
            reports.
          </p>
        </div>
        <Link
          href="/account#notifications"
          className="font-semibold underline decoration-2 underline-offset-4"
        >
          Email settings
        </Link>
      </header>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filter notifications" className="flex gap-2">
          <Link
            href={href("all")}
            aria-current={!unreadOnly ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
              !unreadOnly ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            All
          </Link>
          <Link
            href={href("unread")}
            aria-current={unreadOnly ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center gap-2 border-2 border-ink px-4 font-semibold",
              unreadOnly ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            Unread{" "}
            <span className={clsx("text-[0.8rem]", unreadOnly ? "text-paper/70" : "text-muted")}>
              {data.unread}
            </span>
          </Link>
        </nav>
        <MarkAllRead disabled={data.unread === 0} />
      </div>

      <p className="mt-4 text-muted" aria-live="polite">
        {data.unread === 0 ? "You are all caught up." : `${data.unread} unread`}
      </p>

      <div className="mt-2 border-t-2 border-ink">
        {data.items.length === 0 ? (
          <EmptyState
            title={unreadOnly ? "Nothing unread." : "No notifications yet."}
            action={
              unreadOnly ? (
                <ButtonLink href="/notifications" variant="secondary">
                  Show all
                </ButtonLink>
              ) : (
                <ButtonLink href="/issues">Explore reports</ButtonLink>
              )
            }
          >
            {unreadOnly
              ? "Everything you have been told about, you have seen."
              : "When a report you filed or follow changes, or moderators act on something of yours, it is listed here."}
          </EmptyState>
        ) : (
          <ul>
            {data.items.map((n) => (
              <NotificationItem key={n.id} notification={n} />
            ))}
          </ul>
        )}
      </div>
      <div className="mt-8">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(p) => href(unreadOnly ? "unread" : "all", p)}
        />
      </div>
    </div>
  );
}
