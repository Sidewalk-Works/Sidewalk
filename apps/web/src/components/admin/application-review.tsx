"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORGANIZATION_LIMITS as L, type StaffApplicationDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

type Mode = null | "info" | "APPROVE" | "REJECT";

/** Review controls. Staff can start, ask and keep private notes; only administrators decide. The server enforces both. */
export function ApplicationReview({
  app,
  isAdmin
}: {
  app: StaffApplicationDto;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [appoint, setAppoint] = useState(true);
  const [notes, setNotes] = useState(app.reviewerNotes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);

  const reviewable = app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";
  const blocked = app.reviewerConflict;
  const close = () => {
    setMode(null);
    setMessage("");
    setReason("");
  };

  const start = useAction(async () => {
    await api(`/moderation/organization-applications/${app.id}/start-review`, {
      method: "POST",
      json: {}
    });
    router.refresh();
  });
  const ask = useAction(async () => {
    await api(`/moderation/organization-applications/${app.id}/request-info`, {
      method: "POST",
      json: { message: message.trim() }
    });
    close();
    router.refresh();
  });
  const saveNotes = useAction(async () => {
    setNotesSaved(false);
    await api(`/moderation/organization-applications/${app.id}/notes`, {
      method: "POST",
      json: { notes }
    });
    setNotesSaved(true);
  });
  const decide = useAction(async () => {
    if (mode !== "APPROVE" && mode !== "REJECT") return;
    await api(`/admin/organizations/applications/${app.id}/decision`, {
      method: "POST",
      json: {
        decision: mode,
        reason: reason.trim(),
        ...(mode === "APPROVE" ? { appointApplicant: appoint } : {})
      }
    });
    close();
    router.refresh();
  });

  return (
    <section aria-labelledby="actions" className="space-y-5 border-2 border-ink bg-surface p-5">
      <h2 id="actions" className="font-sans text-lg font-bold tracking-tight">
        Review
      </h2>
      {blocked && (
        <Alert tone="warn" title="You cannot review this one">
          {blocked}
        </Alert>
      )}
      {(start.error ?? saveNotes.error) && (
        <Alert tone="error">{(start.error ?? saveNotes.error)?.message}</Alert>
      )}
      <div className="flex flex-wrap gap-3">
        {app.status === "SUBMITTED" && (
          <Button
            variant="secondary"
            disabled={Boolean(blocked)}
            loading={start.pending}
            onClick={() => void start.run()}
          >
            Start review
          </Button>
        )}
        {reviewable && (
          <Button variant="secondary" disabled={Boolean(blocked)} onClick={() => setMode("info")}>
            Ask the applicant a question
          </Button>
        )}
        {reviewable && isAdmin && (
          <>
            <Button disabled={Boolean(blocked)} onClick={() => setMode("APPROVE")}>
              Approve and verify
            </Button>
            <Button variant="danger" disabled={Boolean(blocked)} onClick={() => setMode("REJECT")}>
              Do not approve
            </Button>
          </>
        )}
      </div>
      {reviewable && !isAdmin && (
        <p className="text-[0.875rem] text-muted">
          Only an administrator can approve or reject. You can ask questions and add notes.
        </p>
      )}

      <div>
        <Field
          label="Private reviewer notes"
          hint="Only staff can read these. The applicant never sees them."
        >
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={L.reviewerNotes.max}
            className="min-h-28"
          />
        </Field>
        <Button
          variant="secondary"
          size="sm"
          loading={saveNotes.pending}
          onClick={() => void saveNotes.run()}
        >
          Save notes
        </Button>
        {notesSaved && (
          <span role="status" className="ml-3 text-[0.875rem] text-muted">
            Saved
          </span>
        )}
      </div>

      <Dialog
        open={mode === "info"}
        onOpenChange={(o) => !o && close()}
        title="Ask the applicant"
        description="They see this on their application and by email. They can then update it and send it again."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void ask.run();
          }}
        >
          {ask.error && <Alert tone="error">{ask.error.message}</Alert>}
          <Field label="Your question" required error={ask.fieldError("message")}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={L.infoRequest.max}
              className="min-h-28"
            />
          </Field>
          <div className="flex gap-3">
            <Button
              type="submit"
              loading={ask.pending}
              disabled={message.trim().length < L.infoRequest.min}
            >
              Send question
            </Button>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={mode === "APPROVE" || mode === "REJECT"}
        onOpenChange={(o) => !o && close()}
        title={
          mode === "APPROVE"
            ? `Verify ${app.organization.name}?`
            : `Do not approve ${app.organization.name}?`
        }
        description={
          mode === "APPROVE"
            ? "The organization becomes verified and listed publicly, and its representatives can publish official responses. You are saying you checked its identity and the applicant’s authority yourself."
            : "The organization stays unverified and unlisted. The reason is shown to the applicant and the decision is final for this application."
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void decide.run();
          }}
        >
          {decide.error && <Alert tone="error">{decide.error.message}</Alert>}
          <Field
            label="Reason"
            hint="What you checked and what you found. Recorded permanently; the applicant can read it."
            required
            error={decide.fieldError("reason")}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={L.decisionReason.max}
              className="min-h-28"
            />
          </Field>
          {mode === "APPROVE" && (
            <Checkbox
              label={`Make ${app.applicant.name} the organization’s administrator`}
              hint="They can then invite colleagues. Uncheck to appoint nobody yet."
              checked={appoint}
              onChange={(e) => setAppoint(e.target.checked)}
            />
          )}
          <div className="flex gap-3">
            <Button
              type="submit"
              variant={mode === "APPROVE" ? "primary" : "danger"}
              loading={decide.pending}
              disabled={reason.trim().length < L.decisionReason.min}
            >
              {mode === "APPROVE" ? "Verify organization" : "Record rejection"}
            </Button>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
