"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLES, type Role } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { useAction } from "@/lib/use-action";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  createdAt: string;
  lastLoginAt: string | null;
  reportCount: number;
}

export function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const changeRole = useAction(async (r: Role) => {
    await api(`/admin/users/${user.id}/role`, { method: "PATCH", json: { role: r } });
    router.refresh();
  });
  const setStatus = useAction(async (status: "ACTIVE" | "SUSPENDED") => {
    await api(`/admin/users/${user.id}/status`, {
      method: "PATCH",
      json: {
        status,
        reason: status === "ACTIVE" ? "Reinstated by an administrator after review." : reason
      }
    });
    setSuspending(false);
    setReason("");
    router.refresh();
  });
  const locked = isSelf || user.status === "DELETED";

  return (
    <tr className="border-b border-rule align-top">
      <td className="py-4 pr-4">
        <p className="font-semibold">
          {user.displayName}{" "}
          {isSelf && <span className="text-[0.75rem] font-normal text-muted">(you)</span>}
        </p>
        <p className="text-[0.8125rem] text-muted">
          {user.status === "DELETED" ? "Deleted account" : user.email}
        </p>
      </td>
      <td className="py-4 pr-4">
        <label htmlFor={`role-${user.id}`} className="sr-only">
          Role for {user.displayName}
        </label>
        <Select
          id={`role-${user.id}`}
          value={role}
          disabled={locked || changeRole.pending}
          className="min-w-36 py-2"
          onChange={(e) => {
            const r = e.target.value as Role;
            setRole(r);
            void changeRole.run(r).then((res) => res === undefined && setRole(user.role));
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r[0] + r.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
        {changeRole.error && (
          <p role="alert" className="mt-1 max-w-48 text-[0.8rem] text-danger">
            {changeRole.error.message}
          </p>
        )}
      </td>
      <td className="py-4 pr-4">
        <span className={user.status === "ACTIVE" ? "" : "font-semibold text-danger"}>
          {user.status.toLowerCase()}
        </span>
        <p className="text-[0.78rem] text-muted">
          Joined {formatDate(user.createdAt)} · {user.reportCount} report
          {user.reportCount === 1 ? "" : "s"}
        </p>
      </td>
      <td className="py-4 text-right">
        {!locked &&
          user.role !== "ADMIN" &&
          (user.status === "ACTIVE" ? (
            <Button size="sm" variant="danger" onClick={() => setSuspending(true)}>
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={setStatus.pending}
              onClick={() => void setStatus.run("ACTIVE")}
            >
              Reinstate
            </Button>
          ))}
        <Dialog
          open={suspending}
          onOpenChange={setSuspending}
          title={`Suspend ${user.displayName}?`}
          description="They are signed out immediately and cannot sign in. Their content stays as it is. Your reason is written to the audit log."
        >
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void setStatus.run("SUSPENDED");
            }}
          >
            {setStatus.error && <Alert tone="error">{setStatus.error.message}</Alert>}
            <Field label="Reason" error={setStatus.fieldError("reason")}>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-24"
                maxLength={300}
              />
            </Field>
            <div className="flex gap-3">
              <Button
                type="submit"
                variant="danger"
                loading={setStatus.pending}
                disabled={reason.trim().length < 10}
              >
                Suspend account
              </Button>
              <Button variant="quiet" onClick={() => setSuspending(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog>
      </td>
    </tr>
  );
}
