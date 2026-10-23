"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onUnreadChange } from "@/lib/unread-count";

/**
 * The unread indicator. The number is part of the accessible name, so it is announced, and it is a word as
 * well as a badge: colour is never the only signal.
 */
export function NotificationsLink({ unread }: { unread: number }) {
  const [count, setCount] = useState(unread);
  const [fromServer, setFromServer] = useState(unread);
  // A fresh server render is authoritative; between renders, notification actions adjust the number directly.
  if (fromServer !== unread) {
    setFromServer(unread);
    setCount(unread);
  }
  useEffect(
    () =>
      onUnreadChange((change) =>
        setCount((c) => Math.max(0, "set" in change ? change.set : c + change.delta))
      ),
    []
  );

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative inline-flex size-11 items-center justify-center border-2 border-transparent hover:border-ink"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center bg-laterite px-1 text-[0.7rem] font-bold leading-5 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
