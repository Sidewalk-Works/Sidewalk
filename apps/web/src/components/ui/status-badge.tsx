import clsx from "clsx";
import {
  STATUS_INFO,
  VERIFICATION_INFO,
  type ReportStatus,
  type ResolutionVerification
} from "@sidewalk/contracts";
import { STATUS_STYLE } from "@/lib/status";

/** A status is always a word first. The coloured square is reinforcement, never the only signal. */
export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-[2px] border px-2.5 py-1 text-[0.8125rem] font-bold leading-none",
        s.chip,
        className
      )}
    >
      <span className={clsx("size-2.5 shrink-0", s.swatch)} aria-hidden />
      {STATUS_INFO[status].label}
    </span>
  );
}

export function VerificationBadge({
  verification,
  className
}: {
  verification: ResolutionVerification;
  className?: string;
}) {
  if (verification === "NONE") return null;
  const verified = verification === "VERIFIED";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-[2px] border px-2.5 py-1 text-[0.8125rem] font-bold leading-none",
        verified ? "border-kerb bg-kerb text-white" : "border-signal/40 bg-signal-wash text-signal",
        className
      )}
    >
      {VERIFICATION_INFO[verification].label}
    </span>
  );
}
