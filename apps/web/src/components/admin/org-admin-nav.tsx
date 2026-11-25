"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/organizations", label: "Applications", exact: true },
  { href: "/admin/organizations/list", label: "Organizations" },
  { href: "/admin/organizations/relations", label: "Connections to review" },
  { href: "/admin/organizations/responses", label: "Official responses" }
];

export function OrgAdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Organization sections" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
              active ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
