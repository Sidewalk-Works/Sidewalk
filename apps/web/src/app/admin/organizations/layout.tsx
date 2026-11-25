import type { ReactNode } from "react";
import { OrgAdminNav } from "@/components/admin/org-admin-nav";

export default function OrganizationsAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="display-md">Organizations</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Only an administrator’s approval makes an organization verified. A registered profile, an
          invitation or a work email address never does. Every decision is recorded with your
          reason.
        </p>
      </div>
      <OrgAdminNav />
      {children}
    </div>
  );
}
