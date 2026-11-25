"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MEMBER_ROLE_INFO,
  ORGANIZATION_LIMITS as L,
  RESPONSE_TYPES,
  RESPONSE_TYPE_INFO,
  STATUS_INFO,
  canTransition,
  type OfficialResponseDto,
  type ReportStatus,
  type ResponseType,
  type ViewerOrganizationDto
} from "@sidewalk/contracts";
import { EvidencePicker } from "@/components/report/evidence-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { uploadOrganizationEvidence } from "@/lib/upload";
import { useAction } from "@/lib/use-action";

/**
 * Tools for a person acting for an organization on this report. Every control states its public meaning. What is
 * offered here is only a convenience: the server decides again, from the database, on every request.
 */
export function OrganizationPanel({
  reference,
  status,
  items,
  responses
}: {
  reference: string;
  status: ReportStatus;
  items: ViewerOrganizationDto[];
  responses: OfficialResponseDto[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="org-tools" className="space-y-6 border-2 border-ink bg-surface p-5">
      <div>
        <h2 id="org-tools" className="font-sans text-lg font-bold tracking-tight">
          Respond as an organization
        </h2>
        <p className="mt-1 text-[0.9rem] text-muted">
          Only members of an organization see this. What you publish is public, with your
          organization’s name and yours.
        </p>
      </div>
      {items.map((o) => (
        <OrganizationTools
          key={o.slug}
          reference={reference}
          status={status}
          org={o}
          mine={responses.filter((r) => r.organization.slug === o.slug)}
        />
      ))}
    </section>
  );
}

function OrganizationTools({
  reference,
  status,
  org,
  mine
}: {
  reference: string;
  status: ReportStatus;
  org: ViewerOrganizationDto;
  mine: OfficialResponseDto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ResponseType>("ACKNOWLEDGEMENT");
  const [body, setBody] = useState("");
  const [supersedes, setSupersedes] = useState("");
  const [markInProgress, setMarkInProgress] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const current = mine.filter((r) => !r.supersededById);
  const closed = status === "REJECTED" || status === "DUPLICATE";
  const types = RESPONSE_TYPES.filter((t) => {
    if (t === "CORRECTION" || t === "WITHDRAWAL") return current.length > 0;
    if (closed) return false;
    if (t === "RESOLUTION_CLAIM")
      return (
        org.relation !== null &&
        org.relation !== "OUTSIDE_REMIT" &&
        canTransition(status, "RESOLVED", "ORGANIZATION")
      );
    return org.relation !== null;
  });
  const effective = types.includes(type) ? type : (types[0] ?? type);
  const superseding = effective === "CORRECTION" || effective === "WITHDRAWAL";
  const claim = effective === "RESOLUTION_CLAIM";
  const progressible =
    effective === "UPDATE" && canTransition(status, "IN_PROGRESS", "ORGANIZATION");

  const reset = () => {
    setOpen(false);
    setBody("");
    setSupersedes("");
    setMarkInProgress(false);
    setFiles([]);
    setProgress(null);
    setConfirmed(false);
  };

  const add = useAction(async () => {
    await api(`/reports/${reference}/organizations`, {
      method: "POST",
      json: { organizationSlug: org.slug }
    });
    router.refresh();
  });

  const publish = useAction(async () => {
    const evidenceIds: string[] = [];
    if (claim) {
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading photograph ${i + 1} of ${files.length}…`);
        evidenceIds.push((await uploadOrganizationEvidence(reference, f, org.slug)).id);
      }
    }
    await api(`/reports/${reference}/official-responses`, {
      method: "POST",
      json: {
        organizationSlug: org.slug,
        type: effective,
        body: body.trim(),
        ...(superseding ? { supersedesId: supersedes || current[0]?.id } : {}),
        ...(claim ? { evidenceIds } : {}),
        ...(progressible && markInProgress ? { markInProgress: true } : {})
      }
    });
    reset();
    router.refresh();
  });

  return (
    <div className="space-y-3 border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-semibold">{org.name}</h3>
        <p className="text-[0.85rem] text-muted">Your role: {MEMBER_ROLE_INFO[org.role].label}</p>
      </div>
      {!org.canRespond ? (
        <p className="border-l-4 border-signal bg-signal-wash px-3 py-2 text-[0.9rem]">
          {org.reason}
        </p>
      ) : org.relation === null ? (
        <div className="space-y-2">
          {add.error && <Alert tone="error">{add.error.message}</Alert>}
          <p className="text-[0.9rem]">
            This organization is not connected to the report yet. Adding it is public, and is not
            accepting responsibility.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            loading={add.pending}
            onClick={() => void add.run()}
          >
            Add {org.name} to this report
          </Button>
        </div>
      ) : (
        <>
          {org.relation === "OUTSIDE_REMIT" && (
            <p className="text-[0.85rem] text-muted">
              You have said this is outside your remit. Acknowledging it again takes that back.
            </p>
          )}
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => setOpen(true)}
            disabled={types.length === 0}
          >
            Write a response
          </Button>
          <Dialog
            open={open}
            onOpenChange={(o) => !o && reset()}
            title={`Respond for ${org.name}`}
            description="Published under your name and the organization’s. It cannot be edited afterwards; a correction or withdrawal is a new entry and the original stays on the record."
          >
            <form
              className="space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void publish.run();
              }}
            >
              {publish.error && <Alert tone="error">{publish.error.message}</Alert>}
              <Field label="What kind of response is this?" required>
                <Select value={effective} onChange={(e) => setType(e.target.value as ResponseType)}>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {RESPONSE_TYPE_INFO[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="-mt-2 text-[0.875rem] text-muted">
                {RESPONSE_TYPE_INFO[effective].meaning}
              </p>
              {superseding && (
                <Field label="Which statement does this replace?" required>
                  <Select
                    value={supersedes || current[0]?.id || ""}
                    onChange={(e) => setSupersedes(e.target.value)}
                  >
                    {current.map((r) => (
                      <option key={r.id} value={r.id}>
                        {RESPONSE_TYPE_INFO[r.type].label}: {r.body.slice(0, 60)}
                        {r.body.length > 60 ? "…" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label={
                  superseding ? "What is being corrected or withdrawn, and why" : "Your statement"
                }
                required
                hint="Everyone who views the report will read this."
                error={publish.fieldError("body")}
              >
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={L.responseBody.max}
                  className="min-h-32"
                />
              </Field>
              {progressible && (
                <Checkbox
                  label="Also record the report as in progress"
                  hint={`Changes the public status to “${STATUS_INFO.IN_PROGRESS.label}”, stated by your organization.`}
                  checked={markInProgress}
                  onChange={(e) => setMarkInProgress(e.target.checked)}
                />
              )}
              {claim && (
                <>
                  <div>
                    <p className="mb-1.5 font-semibold">Photographs of the fix</p>
                    <p className="mb-2 text-[0.875rem] text-muted">
                      Required. Photographs your organization supplies are shown as its evidence.
                    </p>
                    <EvidencePicker files={files} onChange={setFiles} max={6} />
                  </div>
                  <Alert tone="warn" title="This is a claim, not a verified outcome">
                    The report will show as resolved, labelled as your organization’s claim.
                    Sidewalk staff may check it independently, and the person who filed the report
                    can reopen it.
                  </Alert>
                  <Checkbox
                    label="I understand this is published as our organization’s claim"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                </>
              )}
              {progress && (
                <p role="status" className="text-[0.9rem] text-muted">
                  {progress}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  loading={publish.pending}
                  disabled={
                    body.trim().length < L.responseBody.min ||
                    (claim && (files.length === 0 || !confirmed))
                  }
                >
                  Publish response
                </Button>
                <Button variant="quiet" onClick={reset}>
                  Cancel
                </Button>
              </div>
            </form>
          </Dialog>
        </>
      )}
    </div>
  );
}
