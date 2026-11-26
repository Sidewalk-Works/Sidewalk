"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FLAG_REASONS, FLAG_REASON_LABELS, LIMITS, type FlagReason } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

interface Props {
  /** API path that receives the flag, for example /reports/SW-ABC123/flags. */
  endpoint: string;
  subject: "report" | "comment" | "statement";
  signedIn: boolean;
  alreadyFlagged?: boolean;
  compact?: boolean;
}

export function FlagDialog({ endpoint, subject, signedIn, alreadyFlagged, compact }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(alreadyFlagged ?? false);
  const [reason, setReason] = useState<FlagReason>("SPAM");
  const [details, setDetails] = useState("");
  const submit = useAction(async () => {
    await api(endpoint, { method: "POST", json: { reason, details: details.trim() || undefined } });
    setDone(true);
    setOpen(false);
    router.refresh();
  });

  if (done)
    return (
      <span className="text-[0.85rem] text-muted">
        {compact ? "Flagged" : "You flagged this for review"}
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={
          compact
            ? "inline-flex items-center gap-1 text-[0.85rem] text-muted underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-ink"
            : "inline-flex min-h-11 items-center gap-2 font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
        }
        onClick={() =>
          signedIn
            ? setOpen(true)
            : router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        }
      >
        <Flag className="size-4" aria-hidden /> {compact ? "Flag" : `Flag this ${subject}`}
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Flag this ${subject}`}
        description="Flags go to Sidewalk moderators, not to the public. Use this for spam, abuse, personal information or deliberately false claims."
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit.run();
          }}
        >
          {submit.error && <Alert tone="error">{submit.error.message}</Alert>}
          <Field label="What is wrong with it?" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value as FlagReason)}>
              {FLAG_REASONS.map((r) => (
                <option key={r} value={r}>
                  {FLAG_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Anything moderators should know?" optional>
            <Textarea
              value={details}
              maxLength={LIMITS.flagDetails.max}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-24"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={submit.pending}>
              Send flag
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
