"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, ShieldCheck, FileText, RotateCcw, Scale, CircleCheck } from "lucide-react";
import type { NotificationDto, NotificationType } from "@sidewalk/contracts";
import { api } from "@/lib/client-api";
import { timeAgo } from "@/lib/format";
import { announceUnread } from "@/lib/unread-count";

const ICON: Record<NotificationType, typeof FileText> = {
  STATUS_CHANGED: FileText,
  REOPENED: RotateCcw,
  RESOLUTION_VERIFIED: CircleCheck,
  COMMENT: MessageSquare,
  STAFF_UPDATE: ShieldCheck,
  MODERATION: Scale,
  REPORT_UPDATE: FileText
};

/**
 * One notification. Unread ones say "Unread" in words as well as in weight. Opening it marks it read; the
 * explicit button lets someone mark it read or unread without leaving the page.
 */
export function NotificationItem({ notification }: { notification: NotificationDto }) {
  const router = useRouter();
  const [read, setRead] = useState(notification.read);
  const [error, setError] = useState<string | null>(null);
  const Icon = ICON[notification.type];

  async function toggle() {
    setError(null);
    const next = !read;
    setRead(next);
    announceUnread({ delta: next ? -1 : 1 });
    try {
      await api(`/notifications/${notification.id}/${next ? "read" : "unread"}`, {
        method: "POST",
        json: {}
      });
      router.refresh();
    } catch {
      setRead(!next);
      announceUnread({ delta: next ? 1 : -1 });
      setError("That did not save. Try again.");
    }
  }

  return (
    <li
      className={`grid gap-x-4 gap-y-2 border-b border-rule py-5 sm:grid-cols-[2rem_1fr_auto] ${read ? "" : "bg-surface"}`}
    >
      <Icon className="mt-1 hidden size-5 text-ink-soft sm:block" aria-hidden />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 text-[0.8rem] text-muted">
          {!read && (
            <span className="bg-laterite px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-white">
              Unread
            </span>
          )}
          <time dateTime={notification.createdAt}>{timeAgo(notification.createdAt)}</time>
        </p>
        <h3
          className={`mt-1 font-display text-[1.3rem] leading-snug ${read ? "font-normal" : "font-semibold"}`}
        >
          <Link
            href={notification.url}
            className="underline decoration-laterite decoration-2 underline-offset-4"
            onClick={() => {
              if (read) return;
              setRead(true);
              announceUnread({ delta: -1 });
              // Fire and forget: the page the link goes to should not wait for this. If it fails the next load
              // shows the true count again.
              void api(`/notifications/${notification.id}/read`, {
                method: "POST",
                json: {}
              }).catch(() => announceUnread({ delta: 1 }));
            }}
          >
            {notification.title}
          </Link>
        </h3>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-ink-soft">{notification.body}</p>
        {error && (
          <p role="alert" className="mt-1 text-[0.85rem] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        className="self-start text-[0.875rem] font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink sm:justify-self-end"
      >
        {read ? "Mark as unread" : "Mark as read"}
        <span className="sr-only">: {notification.title}</span>
      </button>
    </li>
  );
}
