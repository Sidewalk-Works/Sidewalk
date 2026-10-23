"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LIMITS } from "@sidewalk/contracts";
import { formatBytes } from "@/lib/files";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
  /** Shown when nothing is selected. */
  hint?: string;
}

const ACCEPT = LIMITS.evidence.mimeTypes.join(",");

/** Validates and previews photographs on the device before anything is uploaded. The server re-checks everything. */
export function EvidencePicker({ files, onChange, max, hint }: Props) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    const found: string[] = [];
    for (const f of Array.from(list)) {
      if (!(LIMITS.evidence.mimeTypes as readonly string[]).includes(f.type))
        found.push(`${f.name}: only JPEG, PNG or WebP photographs can be uploaded.`);
      else if (f.size > LIMITS.evidence.maxFileBytes)
        found.push(
          `${f.name}: ${formatBytes(f.size)} is over the ${formatBytes(LIMITS.evidence.maxFileBytes)} limit.`
        );
      else if (next.some((n) => n.name === f.name && n.size === f.size))
        found.push(`${f.name}: already added.`);
      else if (next.length >= max) found.push(`${f.name}: you can add up to ${max} photographs.`);
      else next.push(f);
    }
    setProblems(found);
    onChange(next);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => add(e.target.files)}
        disabled={files.length >= max}
      />
      <label
        htmlFor={inputId}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-ink/60 bg-surface px-4 py-6 text-center transition-colors hover:border-ink hover:bg-paper-deep focus-within:outline-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60`}
      >
        <Camera className="size-6" aria-hidden />
        <span className="font-semibold">
          {files.length === 0
            ? "Choose photographs"
            : files.length >= max
              ? "Maximum reached"
              : "Add more photographs"}
        </span>
        <span className="text-[0.85rem] text-muted">
          {hint ??
            `JPEG, PNG or WebP, up to ${formatBytes(LIMITS.evidence.maxFileBytes)} each, up to ${max} photographs`}
        </span>
      </label>

      {problems.length > 0 && (
        <ul
          role="alert"
          className="mt-3 space-y-1 border-l-4 border-danger bg-danger-wash px-3 py-2 text-[0.9rem]"
        >
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label="Selected photographs"
        >
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="relative border border-rule bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt={`Preview of ${f.name}`}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="px-2 py-1.5 text-[0.75rem] leading-tight">
                <p className="truncate font-semibold">{f.name}</p>
                <p className="text-muted">{formatBytes(f.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 inline-flex size-8 items-center justify-center bg-ink text-paper hover:bg-laterite"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
