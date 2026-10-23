import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireStaff } from "@/lib/server-api";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff("/admin");
  return (
    <div className="wrap py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{user.role === "ADMIN" ? "Administrator" : "Moderator"}</p>
          <h1 className="display-lg mt-2">Moderation</h1>
        </div>
        <p className="max-w-sm text-[0.875rem] text-muted">
          Decisions are recorded with your reason in the moderation history and the audit log.
          Public pages never show internal notes.
        </p>
      </header>
      <AdminNav isAdmin={user.role === "ADMIN"} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
