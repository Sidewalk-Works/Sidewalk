"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS, type ModerationState } from "@sidewalk/contracts";
import { ModerationDialog } from "@/components/report/moderation-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

export function ModerateButton({
  endpoint,
  subject,
  state,
  isAdmin,
  label = "Moderate"
}: {
  endpoint: string;
  subject: "report" | "comment";
  state: ModerationState;
  isAdmin: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ModerationDialog
        open={open}
        onOpenChange={setOpen}
        endpoint={endpoint}
        subject={subject}
        currentState={state}
        isAdmin={isAdmin}
        onDone={() => router.refresh()}
      />
    </>
  );
}

export function DismissFlagButton({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const dismiss = useAction(async () => {
    await api(`/moderation/flags/${flagId}/dismiss`, { method: "POST", json: { reason } });
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
        Dismiss flag
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Dismiss this flag"
        description="Use this when the content follows the guidelines. Your reason is saved to the moderation history."
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void dismiss.run();
          }}
        >
          {dismiss.error && <Alert tone="error">{dismiss.error.message}</Alert>}
          <Field label="Reason" error={dismiss.fieldError("reason")} required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={LIMITS.moderationReason.max}
              className="min-h-24"
            />
          </Field>
          <div className="flex gap-3">
            <Button
              type="submit"
              loading={dismiss.pending}
              disabled={reason.trim().length < LIMITS.moderationReason.min}
            >
              Dismiss
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
