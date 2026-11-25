"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MEMBER_ROLE_INFO } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";
import { useHashToken } from "@/lib/use-hash-token";

type Check =
  | { state: "invalid" | "expired" }
  | {
      state: "valid";
      organization: { name: string; slug: string; verified: boolean };
      roleLabel: string;
      role?: keyof typeof MEMBER_ROLE_INFO;
      emailHint: string;
    };

/**
 * Landing page for an emailed invitation. The secret is read from the address fragment, which the server never sees,
 * and removed from the address bar. Looking at an invitation does not use it up; accepting needs a sign-in as the
 * invited, confirmed address.
 */
export function InvitationResponse({
  signedIn,
  emailVerified
}: {
  signedIn: boolean;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const { ready, token } = useHashToken();
  const [check, setCheck] = useState<Check | null>(null);
  const [done, setDone] = useState<null | "accepted" | "declined">(null);

  const secret = token;

  useEffect(() => {
    if (!ready || !secret) return;
    let cancelled = false;
    api<Check>("/organization-invitations/check", { method: "POST", json: { token: secret } })
      .then((c) => !cancelled && setCheck(c))
      .catch(() => !cancelled && setCheck({ state: "invalid" }));
    return () => {
      cancelled = true;
    };
  }, [ready, secret]);

  const accept = useAction(async () => {
    await api("/organization-invitations/accept", { method: "POST", json: { token: secret } });
    setDone("accepted");
    router.refresh();
  });
  const decline = useAction(async () => {
    await api("/organization-invitations/decline", { method: "POST", json: { token: secret } });
    setDone("declined");
  });

  const shown: Check | null = ready && !secret ? { state: "invalid" } : check;
  if (!shown) return <p role="status">Checking this invitation…</p>;

  if (done === "accepted")
    return (
      <Alert tone="success" title="You have joined">
        You now belong to the organization.{" "}
        <Link href="/organizations/mine" className="font-semibold underline underline-offset-2">
          See my organizations
        </Link>
      </Alert>
    );
  if (done === "declined")
    return (
      <Alert tone="info" title="Invitation declined">
        Nothing has changed for you or the organization.
      </Alert>
    );

  if (shown.state !== "valid")
    return (
      <Alert
        tone="warn"
        title={
          shown.state === "expired"
            ? "This invitation has expired"
            : "This invitation link is not valid, or has already been used"
        }
      >
        Ask an administrator of the organization to send a new one. Links work once, expire, and
        stop working if the invitation is withdrawn.
      </Alert>
    );

  const next = "/organizations/invitations/accept";
  return (
    <div className="space-y-6">
      <Alert tone="info" title={`You are invited to join ${shown.organization.name}`}>
        Role: {shown.roleLabel}. Sent to {shown.emailHint}.{" "}
        {shown.organization.verified
          ? "Sidewalk staff have verified this organization."
          : "This organization is not verified."}{" "}
        An invitation does not verify you or the organization, and gives no Sidewalk staff access.
      </Alert>
      {accept.error && <Alert tone="error">{accept.error.message}</Alert>}
      {decline.error && <Alert tone="error">{decline.error.message}</Alert>}
      {!signedIn ? (
        <div className="space-y-3">
          <p>
            Sign in with the account that uses the invited address to accept. Open this same link
            again afterwards.
          </p>
          <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="primary">
            Sign in
          </ButtonLink>
        </div>
      ) : !emailVerified ? (
        <p>
          Confirm your email address first.{" "}
          <Link href="/verify-email" className="font-semibold underline underline-offset-2">
            Confirm it now
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button loading={accept.pending} onClick={() => void accept.run()}>
            Accept invitation
          </Button>
          <Button variant="secondary" loading={decline.pending} onClick={() => void decline.run()}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
