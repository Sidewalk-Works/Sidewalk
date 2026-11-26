"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORGANIZATION_LIMITS as L, type StaffOrganizationDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

type Act = "suspend" | "reinstate" | "revoke-verification";

const COPY: Record<Act, { title: string; effect: string; button: string; danger: boolean }> = {
  suspend: {
    title: "Suspend this organization",
    effect:
      "Nobody can respond for it, effective immediately, even people who are signed in. Its profile and earlier statements stay visible, marked as suspended. Members are told it happened, not why.",
    button: "Suspend",
    danger: true
  },
  reinstate: {
    title: "Reinstate this organization",
    effect: "Its representatives can respond to reports again, straight away.",
    button: "Reinstate",
    danger: false
  },
  "revoke-verification": {
    title: "Withdraw this organization’s verification",
    effect:
      "It stops being verified and nobody can respond for it, effective immediately. Statements it published while verified stay on the record, marked as made then. Reversing this needs a new application.",
    button: "Withdraw verification",
    danger: true
  }
};

/** Suspension, reinstatement and withdrawal of verification: administrators only, always with a recorded reason. */
export function OrganizationGovernance({
  org,
  isAdmin
}: {
  org: StaffOrganizationDto;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [act, setAct] = useState<Act | null>(null);
  const [reason, setReason] = useState("");
  const run = useAction(async () => {
    if (!act) return;
    await api(`/admin/organizations/${org.id}/${act}`, {
      method: "POST",
      json: { reason: reason.trim() }
    });
    setAct(null);
    setReason("");
    router.refresh();
  });
  const actions: Act[] = [
    ...(org.status === "SUSPENDED" ? (["reinstate"] as const) : (["suspend"] as const)),
    ...(org.verificationStatus === "VERIFIED" ? (["revoke-verification"] as const) : [])
  ];
  return (
    <section aria-labelledby="gov" className="space-y-4 border-2 border-ink bg-surface p-5">
      <h2 id="gov" className="font-sans text-lg font-bold tracking-tight">
        Standing
      </h2>
      {org.conflict && (
        <Alert tone="warn" title="You cannot decide this one">
          {org.conflict}
        </Alert>
      )}
      {!isAdmin ? (
        <p className="text-[0.9rem] text-muted">
          Only an administrator can suspend or withdraw verification.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === "reinstate" ? "secondary" : "danger"}
              disabled={Boolean(org.conflict)}
              onClick={() => setAct(a)}
            >
              {COPY[a].button}
            </Button>
          ))}
        </div>
      )}
      <Dialog
        open={act !== null}
        onOpenChange={(o) => !o && setAct(null)}
        title={act ? COPY[act].title : ""}
        description={act ? COPY[act].effect : undefined}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run.run();
          }}
        >
          {run.error && <Alert tone="error">{run.error.message}</Alert>}
          <Field
            label="Reason"
            required
            hint="Recorded permanently in the verification history and the audit log."
            error={run.fieldError("reason")}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={L.governanceReason.max}
              className="min-h-28"
            />
          </Field>
          <div className="flex gap-3">
            <Button
              type="submit"
              variant={act && COPY[act].danger ? "danger" : "primary"}
              loading={run.pending}
              disabled={reason.trim().length < L.governanceReason.min}
            >
              {act ? COPY[act].button : ""}
            </Button>
            <Button variant="quiet" onClick={() => setAct(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
