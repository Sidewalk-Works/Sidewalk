"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const staffTabs = [
  { href: "/admin", label: "Flag queue" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/history", label: "History" }
];
const adminTabs = [
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/email", label: "Email delivery" },
  { href: "/admin/audit", label: "Audit log" }
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...staffTabs, ...adminTabs] : staffTabs;
  return (
    <nav
      aria-label="Moderation sections"
      className="mt-8 flex flex-wrap gap-x-1 gap-y-1 border-b-2 border-ink"
    >
      {tabs.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "-mb-0.5 inline-flex min-h-11 items-center border-2 border-b-0 px-4 font-semibold",
              active ? "border-ink bg-ink text-paper" : "border-transparent hover:border-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
