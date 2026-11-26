"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { EvidenceDto } from "@sidewalk/contracts";
import { Dialog } from "@/components/ui/dialog";

/** Thumbnails open a larger view. Photographs are the reporter's own evidence, served with visibility checks. */
export function EvidenceGallery({ items, label }: { items: EvidenceDto[]; label: string }) {
  const [index, setIndex] = useState<number | null>(null);
  if (items.length === 0) return null;
  const current = index === null ? null : items[index];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={label}>
        {items.map((e, i) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group block w-full text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.thumbUrl}
                alt={e.caption ?? `${label}, photograph ${i + 1} of ${items.length}`}
                width={e.width}
                height={e.height}
                loading="lazy"
                className="aspect-[4/3] w-full border border-rule object-cover transition group-hover:border-ink"
              />
              {e.caption && (
                <span className="mt-1.5 block text-[0.8125rem] text-muted">{e.caption}</span>
              )}
              <span className="sr-only">Open larger view</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={index !== null}
        onOpenChange={(o) => !o && setIndex(null)}
        title={`${label} ${index !== null ? index + 1 : ""} of ${items.length}`}
      >
        {current && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.fullUrl}
              alt={current.caption ?? `${label}, photograph ${(index ?? 0) + 1}`}
              className="max-h-[60dvh] w-full bg-paper-deep object-contain"
            />
            {current.caption && <p className="mt-3 text-[0.95rem]">{current.caption}</p>}
            {items.length > 1 && (
              <div className="mt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setIndex(((index ?? 0) - 1 + items.length) % items.length)}
                  className="inline-flex min-h-11 items-center gap-1 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper"
                >
                  <ChevronLeft className="size-4" aria-hidden /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setIndex(((index ?? 0) + 1) % items.length)}
                  className="inline-flex min-h-11 items-center gap-1 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper"
                >
                  Next <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
