"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MEMBER_ROLES,
  MEMBER_ROLE_INFO,
  type InvitationDto,
  type MemberDto,
  type MemberRole
} from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/use-action";

const STATUS_WORDS: Record<InvitationDto["status"], string> = {
  PENDING: "Waiting for a reply",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  REVOKED: "Withdrawn",
  EXPIRED: "Expired"
};

export function TeamManager({
  slug,
  orgName,
  members,
  invitations,
  canManage,
  selfUserId
}: {
  slug: string;
  orgName: string;
  members: MemberDto[];
  invitations: InvitationDto[];
  canManage: boolean;
  selfUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("REPRESENTATIVE");
  const [sent, setSent] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const [reason, setReason] = useState("");

  const invite = useAction(async () => {
    setSent(null);
    await api(`/organizations/${slug}/invitations`, { method: "POST", json: { email, role } });
    setSent(email.trim());
    setEmail("");
    router.refresh();
  });
  const changeRole = useAction(async (id: string, next: MemberRole) => {
    await api(`/organizations/${slug}/members/${id}`, { method: "PATCH", json: { role: next } });
    router.refresh();
  });
  const remove = useAction(async () => {
    if (!removing) return;
    await api(`/organizations/${slug}/members/${removing.id}/revoke`, {
      method: "POST",
      json: { reason: reason.trim() || undefined }
    });
    setRemoving(null);
    setReason("");
    router.refresh();
  });
  const resend = useAction(async (id: string) => {
    await api(`/organizations/${slug}/invitations/${id}/resend`, { method: "POST", json: {} });
    router.refresh();
  });
  const revoke = useAction(async (id: string) => {
    await api(`/organizations/${slug}/invitations/${id}/revoke`, { method: "POST", json: {} });
    router.refresh();
  });

  const active = members.filter((m) => m.status === "ACTIVE");
  const past = members.filter((m) => m.status !== "ACTIVE");
  const actionError = changeRole.error ?? resend.error ?? revoke.error;

  return (
    <div className="space-y-14">
      {actionError && <Alert tone="error">{actionError.message}</Alert>}

      <section aria-labelledby="roster">
        <h2 id="roster" className="display-md">
          Who belongs
        </h2>
        <ul className="mt-4 border-t-2 border-ink">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-4"
            >
              <div>
                <p className="font-semibold">
                  {m.name}
                  {m.userId === selfUserId && (
                    <span className="font-normal text-muted"> (you)</span>
                  )}
                </p>
                <p className="text-[0.85rem] text-muted">Since {formatDateTime(m.addedAt)}</p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="sr-only" htmlFor={`role-${m.id}`}>
                    Role of {m.name}
                  </label>
                  <Select
                    id={`role-${m.id}`}
                    value={m.role}
                    className="!w-auto"
                    disabled={changeRole.pending}
                    onChange={(e) => void changeRole.run(m.id, e.target.value as MemberRole)}
                  >
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {MEMBER_ROLE_INFO[r].label}
                      </option>
                    ))}
                  </Select>
                  <Button variant="danger" size="sm" onClick={() => setRemoving(m)}>
                    Remove
                    <span className="sr-only"> {m.name}</span>
                  </Button>
                </div>
              ) : (
                <p>{MEMBER_ROLE_INFO[m.role].label}</p>
              )}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-3 text-[0.875rem] text-muted sm:grid-cols-3">
          {MEMBER_ROLES.map((r) => (
            <div key={r}>
              <dt className="font-semibold text-ink">{MEMBER_ROLE_INFO[r].label}</dt>
              <dd>{MEMBER_ROLE_INFO[r].meaning}</dd>
            </div>
          ))}
        </dl>
        {past.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer font-semibold">
              Former members ({past.length})
            </summary>
            <ul className="mt-3 space-y-2 text-[0.9rem]">
              {past.map((m) => (
                <li key={m.id}>
                  {m.name} ({MEMBER_ROLE_INFO[m.role].label}), removed{" "}
                  {m.revokedAt ? formatDateTime(m.revokedAt) : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {canManage && (
        <section aria-labelledby="invite">
          <h2 id="invite" className="display-md">
            Invite someone
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            We email a single-use link. It only works for the person signed in with that confirmed
            address, and it expires. An invitation lets someone join {orgName}; it does not verify
            them, and it gives no access to Sidewalk staff tools.
          </p>
          <form
            className="mt-4 grid max-w-2xl gap-x-4 sm:grid-cols-[2fr_1fr_auto]"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void invite.run();
            }}
          >
            <Field label="Email address" required error={invite.fieldError("email")}>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {MEMBER_ROLE_INFO[r].label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="pt-7">
              <Button type="submit" loading={invite.pending} disabled={!email.trim()}>
                Send invitation
              </Button>
            </div>
          </form>
          {invite.error && <Alert tone="error">{invite.error.message}</Alert>}
          {sent && (
            <Alert tone="success">
              If that address can receive email, an invitation is on its way to {sent}.
            </Alert>
          )}
        </section>
      )}

      {canManage && (
        <section aria-labelledby="invitations">
          <h2 id="invitations" className="display-md">
            Invitations
          </h2>
          {invitations.length === 0 ? (
            <p className="mt-3 text-muted">No invitations have been sent.</p>
          ) : (
            <ul className="mt-4 border-t-2 border-ink">
              {invitations.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-4"
                >
                  <div>
                    <p className="font-semibold">{i.email}</p>
                    <p className="text-[0.85rem] text-muted">
                      {MEMBER_ROLE_INFO[i.role].label} · {STATUS_WORDS[i.status]} · sent{" "}
                      {i.sentCount}× · last {formatDateTime(i.lastSentAt)}
                      {i.status === "PENDING" && <> · expires {formatDateTime(i.expiresAt)}</>}
                    </p>
                  </div>
                  {i.status === "PENDING" && (
                    <div className="flex gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={resend.pending}
                        onClick={() => void resend.run(i.id)}
                      >
                        Send again
                        <span className="sr-only"> to {i.email}</span>
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={revoke.pending}
                        onClick={() => void revoke.run(i.id)}
                      >
                        Withdraw
                        <span className="sr-only"> invitation to {i.email}</span>
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this person"}?`}
        description="They lose access straight away, even if they are signed in. Their earlier statements stay on the record."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void remove.run();
          }}
        >
          {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
          <Field label="Reason" optional hint="Recorded in the audit log. Staff can read it.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-20"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" loading={remove.pending}>
              Remove from organization
            </Button>
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
