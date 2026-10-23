"use client";

import { Camera, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS, type ReportDetailDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { uploadAll } from "@/lib/upload";
import { useAction } from "@/lib/use-action";
import { EvidencePicker } from "./evidence-picker";

type Mode = null | "resolve" | "reopen" | "photos";

export function OwnerPanel({ report }: { report: ReportDetailDto }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const canResolve = report.viewer.allowedTransitions.includes("RESOLVED");
  const canReopen = report.viewer.allowedTransitions.includes("REOPENED");
  const canAddPhotos =
    report.status !== "REJECTED" &&
    report.status !== "DUPLICATE" &&
    report.evidence.length < LIMITS.evidence.maxPerReport;

  const close = () => {
    setMode(null);
    setNote("");
    setFiles([]);
    setProgress(null);
  };

  const transition = useAction(async (status: "RESOLVED" | "REOPENED") => {
    if (status === "RESOLVED" && files.length > 0) {
      const outcomes = await uploadAll(report.reference, files, "RESOLUTION", (d, t) =>
        setProgress(`Uploading photograph ${d} of ${t}…`)
      );
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length > 0)
        throw new Error(
          `${failed.length} photograph(s) could not be uploaded: ${failed[0]?.error}. Remove them or try again.`
        );
    }
    await api(`/reports/${report.reference}/status`, { method: "POST", json: { status, note } });
    close();
    router.refresh();
  });

  const addPhotos = useAction(async () => {
    const outcomes = await uploadAll(report.reference, files, "REPORT", (d, t) =>
      setProgress(`Uploading photograph ${d} of ${t}…`)
    );
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length > 0) {
      setFiles(failed.map((f) => f.file));
      throw new Error(
        `${outcomes.length - failed.length} uploaded, ${failed.length} failed: ${failed[0]?.error}`
      );
    }
    close();
    router.refresh();
  });

  return (
    <section aria-labelledby="owner-tools" className="border-2 border-ink bg-surface p-5">
      <h2 id="owner-tools" className="font-sans text-lg font-bold tracking-tight">
        You filed this report
      </h2>
      <p className="mt-1 text-[0.9rem] text-muted">Only you can see these tools.</p>
      <div className="mt-4 flex flex-col gap-2.5">
        {report.viewer.canEdit && (
          <Link
            href={`/dashboard/reports/${report.reference}/edit`}
            className={buttonClass("secondary", "md", "w-full")}
          >
            <Pencil className="size-4" aria-hidden /> Edit this report
          </Link>
        )}
        {canAddPhotos && (
          <Button
            variant="secondary"
            className="w-full"
            icon={<Camera className="size-4" aria-hidden />}
            onClick={() => setMode("photos")}
          >
            Add photographs
          </Button>
        )}
        {canResolve && (
          <Button variant="secondary" className="w-full" onClick={() => setMode("resolve")}>
            It has been fixed
          </Button>
        )}
        {canReopen && (
          <Button variant="secondary" className="w-full" onClick={() => setMode("reopen")}>
            It is not fixed: reopen
          </Button>
        )}
        {!report.viewer.canEdit && report.status !== "RESOLVED" && (
          <p className="text-[0.85rem] text-muted">
            The report text is locked once staff have acknowledged it, so the record stays
            consistent. You can still add photographs and comments.
          </p>
        )}
      </div>

      <Dialog
        open={mode === "resolve"}
        onOpenChange={(o) => !o && close()}
        title="Say this has been fixed"
        description="Your statement is shown publicly as a claim from the reporter. It stays unverified until Sidewalk staff check the evidence."
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void transition.run("RESOLVED");
          }}
        >
          {transition.error && <Alert tone="error">{transition.error.message}</Alert>}
          <Field
            label="What was fixed, and how do you know?"
            hint="For example: who repaired it, when, and what you saw."
            error={transition.fieldError("note")}
            required
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={LIMITS.statusNote.max}
              className="min-h-28"
            />
          </Field>
          <div>
            <p className="mb-1.5 font-semibold">
              Photographs of the fix{" "}
              <span className="text-[0.8125rem] font-normal text-muted">
                Optional, but they make the claim much easier to verify
              </span>
            </p>
            <EvidencePicker
              files={files}
              onChange={setFiles}
              max={LIMITS.evidence.maxPerSubmission}
            />
          </div>
          {progress && (
            <p role="status" className="text-[0.9rem] text-muted">
              {progress}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              loading={transition.pending}
              disabled={note.trim().length < LIMITS.statusNote.min}
            >
              Submit resolution claim
            </Button>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={mode === "reopen"}
        onOpenChange={(o) => !o && close()}
        title="Reopen this report"
        description="Reopening clears the resolution label and puts the report back in the queue. The earlier claim stays in the history."
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void transition.run("REOPENED");
          }}
        >
          {transition.error && <Alert tone="error">{transition.error.message}</Alert>}
          <Field
            label="Why is it not fixed?"
            hint="Describe what you see now."
            error={transition.fieldError("note")}
            required
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={LIMITS.statusNote.max}
              className="min-h-28"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              loading={transition.pending}
              disabled={note.trim().length < LIMITS.statusNote.min}
            >
              Reopen report
            </Button>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={mode === "photos"} onOpenChange={(o) => !o && close()} title="Add photographs">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void addPhotos.run();
          }}
        >
          {addPhotos.error && <Alert tone="error">{addPhotos.error.message}</Alert>}
          <EvidencePicker
            files={files}
            onChange={setFiles}
            max={Math.min(
              LIMITS.evidence.maxPerSubmission,
              LIMITS.evidence.maxPerReport - report.evidence.length
            )}
          />
          {progress && (
            <p role="status" className="text-[0.9rem] text-muted">
              {progress}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={addPhotos.pending} disabled={files.length === 0}>
              Upload {files.length > 0 ? files.length : ""} photograph
              {files.length === 1 ? "" : "s"}
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
