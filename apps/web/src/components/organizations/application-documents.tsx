"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LIMITS, type ApplicationDocumentDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { formatBytes } from "@/lib/files";
import { useAction } from "@/lib/use-action";

/** Private supporting documents (photographs or scans). Only the applicant and Sidewalk staff can open them. */
export function ApplicationDocuments({
  applicationId,
  documents,
  canEdit
}: {
  applicationId: string;
  documents: ApplicationDocumentDto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const upload = useAction(async () => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (caption.trim()) form.set("caption", caption.trim());
    await api(`/organization-applications/${applicationId}/documents`, {
      method: "POST",
      body: form
    });
    setFile(null);
    setCaption("");
    if (input.current) input.current.value = "";
    router.refresh();
  });
  const remove = useAction(async (id: string) => {
    await api(`/organization-applications/${applicationId}/documents/${id}`, { method: "DELETE" });
    router.refresh();
  });

  return (
    <section aria-labelledby="docs" className="space-y-4">
      <h2 id="docs" className="display-md">
        Supporting documents
      </h2>
      <p className="max-w-2xl text-muted">
        Photographs or scans of letters, certificates or notices. They are private: only you and
        Sidewalk staff can open them. Do not upload anything you are not allowed to share.
      </p>
      {(upload.error ?? remove.error) && (
        <Alert tone="error">{(upload.error ?? remove.error)?.message}</Alert>
      )}
      {documents.length === 0 ? (
        <p className="border-y border-dashed border-ink/40 py-6 text-muted">
          No documents attached.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Attached documents">
          {documents.map((d, i) => (
            <li key={d.id} className="border border-rule bg-surface">
              <a href={d.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.url}
                  alt={d.caption ?? `Document ${i + 1}`}
                  width={d.width}
                  height={d.height}
                  className="aspect-[4/3] w-full object-contain bg-paper-deep"
                />
              </a>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <p className="text-[0.85rem]">{d.caption ?? `Document ${i + 1}`}</p>
                {canEdit && (
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-label={`Remove ${d.caption ?? `document ${i + 1}`}`}
                    loading={remove.pending}
                    onClick={() => void remove.run(d.id)}
                    icon={<Trash2 className="size-4" aria-hidden />}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && documents.length < 6 && (
        <form
          className="max-w-xl space-y-2 border-2 border-ink bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void upload.run();
          }}
        >
          <Field
            label="Add a document"
            hint={`JPEG, PNG or WebP, up to ${formatBytes(LIMITS.evidence.maxFileBytes)}.`}
          >
            <input
              ref={input}
              type="file"
              accept={LIMITS.evidence.mimeTypes.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[0.95rem]"
            />
          </Field>
          <Field label="What it shows" optional>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={160} />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            loading={upload.pending}
            disabled={!file}
            icon={<Paperclip className="size-4" aria-hidden />}
          >
            Attach document
          </Button>
        </form>
      )}
    </section>
  );
}
