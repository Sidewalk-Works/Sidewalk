"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Accessible modal: focus is trapped and restored, Escape closes, and the title names the dialog. */
export function Dialog({ open, onOpenChange, title, description, children }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/60" />
        <RadixDialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto border-t-4 border-ink bg-surface p-5 shadow-lift sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border-4 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="display-md">{title}</RadixDialog.Title>
            <RadixDialog.Close
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center hover:bg-paper-deep"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="mt-2 text-[0.975rem] text-muted">
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
