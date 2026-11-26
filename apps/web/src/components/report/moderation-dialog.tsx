"use client";

import { useState } from "react";
import {
  LIMITS,
  MODERATION_POLICIES,
  MODERATION_POLICY_LABELS,
  type ModerationActionType,
  type ModerationPolicy,
  type ModerationState
} from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

type Choice = Exclude<ModerationActionType, "DISMISS">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** API path that records the decision. */
  endpoint: string;
  subject: string;
  currentState: ModerationState;
  isAdmin: boolean;
  onDone: () => void;
}

const LABEL: Record<Choice, string> = {
  HIDE: "Hide from the public (reversible by any moderator)",
  REMOVE: "Remove (reversible by administrators only)",
  RESTORE: "Restore to public view"
};

/** Every moderation decision needs a policy and a written reason. Both are recorded permanently. */
export function ModerationDialog({
  open,
  onOpenChange,
  endpoint,
  subject,
  currentState,
  isAdmin,
  onDone
}: Props) {
  const choices: Choice[] =
    currentState === "VISIBLE"
      ? ["HIDE", "REMOVE"]
      : currentState === "HIDDEN"
        ? ["RESTORE", "REMOVE"]
        : isAdmin
          ? ["RESTORE"]
          : [];
  const [action, setAction] = useState<Choice>(choices[0] ?? "HIDE");
  const [policy, setPolicy] = useState<ModerationPolicy>("SPAM");
  const [reason, setReason] = useState("");
  const submit = useAction(async () => {
    await api(endpoint, { method: "POST", json: { action, policy, reason } });
    setReason("");
    onOpenChange(false);
    onDone();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Moderate this ${subject}`}
      description="Your decision, policy and reason are saved to the moderation history and the audit log."
    >
      {choices.length === 0 ? (
        <Alert tone="info">Removed content can only be restored by an administrator.</Alert>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit.run();
          }}
        >
          {submit.error && <Alert tone="error">{submit.error.message}</Alert>}
          <Field label="Decision" required>
            <Select value={action} onChange={(e) => setAction(e.target.value as Choice)}>
              {choices.map((c) => (
                <option key={c} value={c}>
                  {LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Policy" required>
            <Select value={policy} onChange={(e) => setPolicy(e.target.value as ModerationPolicy)}>
              {MODERATION_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {MODERATION_POLICY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Reason"
            hint="Explain what you saw. The author of hidden or removed content can read this."
            error={submit.fieldError("reason")}
            required
          >
            <Textarea
              value={reason}
              minLength={LIMITS.moderationReason.min}
              maxLength={LIMITS.moderationReason.max}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-28"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant={action === "RESTORE" ? "primary" : "danger"}
              loading={submit.pending}
              disabled={reason.trim().length < LIMITS.moderationReason.min}
            >
              Record decision
            </Button>
            <Button variant="quiet" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
