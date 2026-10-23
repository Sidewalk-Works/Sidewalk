"use client";

import type { EvidenceDto, EvidenceKind } from "@sidewalk/contracts";
import { api } from "./client-api";

export async function uploadEvidence(
  reference: string,
  file: File,
  kind: EvidenceKind,
  caption?: string
): Promise<EvidenceDto> {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  if (caption) form.set("caption", caption);
  return api<EvidenceDto>(`/reports/${reference}/evidence`, { method: "POST", body: form });
}

export interface UploadOutcome {
  file: File;
  ok: boolean;
  error?: string;
}

/** Uploads one by one so a single bad file never loses the rest, and reports each result. */
export async function uploadAll(
  reference: string,
  files: File[],
  kind: EvidenceKind,
  onProgress?: (done: number, total: number) => void
): Promise<UploadOutcome[]> {
  const outcomes: UploadOutcome[] = [];
  for (const file of files) {
    try {
      await uploadEvidence(reference, file, kind);
      outcomes.push({ file, ok: true });
    } catch (e) {
      outcomes.push({ file, ok: false, error: (e as Error).message });
    }
    onProgress?.(outcomes.length, files.length);
  }
  return outcomes;
}
