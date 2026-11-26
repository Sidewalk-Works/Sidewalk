"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LIMITS,
  MODERATION_POLICY_LABELS,
  STATUS_INFO,
  transitionRequiresNote,
  type ModerationPolicy,
  type ReportDetailDto,
  type ReportStatus
} from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { uploadAll } from "@/lib/upload";
import { useAction } from "@/lib/use-action";
import { EvidencePicker } from "./evidence-picker";
import { ModerationDialog } from "./moderation-dialog";

interface Note {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}
interface Context {
  moderation: Array<{
    id: string;
    action: string;
    policy: ModerationPolicy | null;
    reason: string;
    moderatorName: string;
    createdAt: string;
  }>;
  flags: Array<{
    id: string;
    reason: string;
    details: string | null;
    status: string;
    reporterName: string;
    createdAt: string;
  }>;
  reporter: { displayName: string; accountStatus: string };
}

export function StaffPanel({ report, isAdmin }: { report: ReportDetailDto; isAdmin: boolean }) {
  const router = useRouter();
  const options = report.viewer.allowedTransitions;
  const [target, setTarget] = useState<ReportStatus | "">(options[0] ?? "");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [moderating, setModerating] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [ctx, setCtx] = useState<Context | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visible = report.moderationState === "VISIBLE";

  const [reloads, setReloads] = useState(0);
  const loadPrivate = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ items: Note[] }>(`/moderation/reports/${report.reference}/notes`),
      api<Context>(`/moderation/reports/${report.reference}/context`)
    ])
      .then(([n, c]) => {
        if (cancelled) return;
        setNotes(n.items);
        setCtx(c);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [report.reference, reloads]);

  const change = useAction(async () => {
    if (!target) return;
    await api(`/reports/${report.reference}/status`, {
      method: "POST",
      json: { status: target, note: note.trim() || undefined }
    });
    setNote("");
    setMessage(`Status changed to ${STATUS_INFO[target].label}.`);
    router.refresh();
  });
  const verify = useAction(async () => {
    await api(`/reports/${report.reference}/verification`, { method: "POST", json: {} });
    setMessage("Resolution marked as verified.");
    router.refresh();
  });
  const upload = useAction(async () => {
    const outcomes = await uploadAll(report.reference, files, "RESOLUTION");
    const failed = outcomes.filter((o) => !o.ok);
    setFiles(failed.map((f) => f.file));
    if (failed.length > 0) throw new Error(failed[0]?.error ?? "Upload failed");
    setMessage("Resolution photographs added.");
    router.refresh();
  });
  const addNote = useAction(async () => {
    const created = await api<Note>(`/moderation/reports/${report.reference}/notes`, {
      method: "POST",
      json: { body: noteDraft }
    });
    setNotes((prev) => [created, ...prev]);
    setNoteDraft("");
  });

  return (
    <section aria-labelledby="staff-tools" className="border-2 border-ink bg-paper-deep p-5">
      <h2
        id="staff-tools"
        className="flex items-center gap-2 font-sans text-lg font-bold tracking-tight"
      >
        <ShieldCheck className="size-5" aria-hidden /> Staff tools
      </h2>
      <p className="mt-1 text-[0.85rem] text-muted">
        Visible only to Sidewalk staff. Every action here is audited.
      </p>
      {message && (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      )}

      {visible && options.length > 0 && (
        <form
          className="mt-5 space-y-4 border-t border-rule pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void change.run();
          }}
        >
          <h3 className="font-sans text-[0.95rem] font-bold">Change status</h3>
          {change.error && <Alert tone="error">{change.error.message}</Alert>}
          <Field label="New status">
            <Select value={target} onChange={(e) => setTarget(e.target.value as ReportStatus)}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {STATUS_INFO[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Public note"
            hint={
              target && transitionRequiresNote(target)
                ? "Required. Shown on the public timeline."
                : "Optional. Shown on the public timeline."
            }
            error={change.fieldError("note")}
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={LIMITS.statusNote.max}
              className="min-h-24"
            />
          </Field>
          <Button type="submit" loading={change.pending} disabled={!target}>
            Record status change
          </Button>
        </form>
      )}

      {visible && report.status === "RESOLVED" && (
        <div className="mt-5 space-y-4 border-t border-rule pt-5">
          <h3 className="font-sans text-[0.95rem] font-bold">Resolution evidence</h3>
          <p className="text-[0.875rem] text-muted">
            {report.verification === "VERIFIED"
              ? "This resolution is verified."
              : report.resolutionEvidence.length === 0
                ? "No photographs of the fix are attached. Verification requires at least one."
                : `${report.resolutionEvidence.length} photograph(s) attached. A different staff member from the one who recorded the resolution must verify it.`}
          </p>
          {report.verification !== "VERIFIED" && (
            <>
              {(upload.error || verify.error) && (
                <Alert tone="error">{(upload.error ?? verify.error)?.message}</Alert>
              )}
              <EvidencePicker
                files={files}
                onChange={setFiles}
                max={LIMITS.evidence.maxPerSubmission}
                hint="Photographs showing the issue after the repair"
              />
              {files.length > 0 && (
                <Button
                  variant="secondary"
                  loading={upload.pending}
                  onClick={() => void upload.run()}
                >
                  Attach {files.length} photograph{files.length === 1 ? "" : "s"}
                </Button>
              )}
              <Button loading={verify.pending} onClick={() => void verify.run()}>
                Verify this resolution
              </Button>
            </>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3 border-t border-rule pt-5">
        <h3 className="font-sans text-[0.95rem] font-bold">Moderation</h3>
        <p className="text-[0.875rem] text-muted">
          Visibility: <strong>{report.moderationState ?? "VISIBLE"}</strong>
          {ctx && ctx.flags.filter((f) => f.status === "OPEN").length > 0 && (
            <> · {ctx.flags.filter((f) => f.status === "OPEN").length} open flag(s)</>
          )}
        </p>
        <Button variant="secondary" onClick={() => setModerating(true)}>
          Hide, remove or restore
        </Button>
        <ModerationDialog
          open={moderating}
          onOpenChange={setModerating}
          endpoint={`/moderation/reports/${report.reference}/actions`}
          subject="report"
          currentState={report.moderationState ?? "VISIBLE"}
          isAdmin={isAdmin}
          onDone={() => {
            router.refresh();
            loadPrivate();
          }}
        />
      </div>

      <div className="mt-5 space-y-3 border-t border-rule pt-5">
        <h3 className="font-sans text-[0.95rem] font-bold">Internal notes</h3>
        <p className="text-[0.8125rem] text-muted">Never shown publicly or to the reporter.</p>
        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="border-l-4 border-ink bg-surface px-3 py-2 text-[0.9rem]">
                <p className="whitespace-pre-line">{n.body}</p>
                <p className="mt-1 text-[0.75rem] text-muted">
                  {n.authorName} · {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {addNote.error && <Alert tone="error">{addNote.error.message}</Alert>}
        <Field label="Add a note">
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            className="min-h-20"
            maxLength={2000}
          />
        </Field>
        <Button
          variant="secondary"
          size="sm"
          loading={addNote.pending}
          disabled={noteDraft.trim().length < 2}
          onClick={() => void addNote.run()}
        >
          Save note
        </Button>
      </div>

      {ctx && (ctx.moderation.length > 0 || ctx.flags.length > 0) && (
        <details className="mt-5 border-t border-rule pt-5">
          <summary className="cursor-pointer font-sans text-[0.95rem] font-bold">
            History for this report
          </summary>
          <ul className="mt-3 space-y-2 text-[0.85rem]">
            {ctx.flags.map((f) => (
              <li key={f.id}>
                Flag ({f.reason.toLowerCase().replace("_", " ")}, {f.status.toLowerCase()}) by{" "}
                {f.reporterName}, {formatDateTime(f.createdAt)}
                {f.details && <> — “{f.details}”</>}
              </li>
            ))}
            {ctx.moderation.map((m) => (
              <li key={m.id}>
                {m.action.toLowerCase()} by {m.moderatorName}{" "}
                {m.policy ? `(${MODERATION_POLICY_LABELS[m.policy]})` : ""},{" "}
                {formatDateTime(m.createdAt)} — “{m.reason}”
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
