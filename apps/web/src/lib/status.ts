import type { ReportStatus } from "@sidewalk/contracts";

/** Tailwind classes plus a literal colour for map markers. Text labels always accompany colour. */
export const STATUS_STYLE: Record<ReportStatus, { chip: string; swatch: string; hex: string }> = {
  SUBMITTED: {
    chip: "bg-paper-deep text-ink-soft border-rule",
    swatch: "bg-muted",
    hex: "#6b746e"
  },
  UNDER_REVIEW: {
    chip: "bg-slate-wash text-slate-blue border-slate-blue/30",
    swatch: "bg-slate-blue",
    hex: "#2b4a78"
  },
  ACKNOWLEDGED: {
    chip: "bg-teal-wash text-teal-civic border-teal-civic/30",
    swatch: "bg-teal-civic",
    hex: "#1b5961"
  },
  IN_PROGRESS: {
    chip: "bg-signal-wash text-signal border-signal/30",
    swatch: "bg-signal",
    hex: "#a56b00"
  },
  RESOLVED: { chip: "bg-kerb-wash text-kerb border-kerb/30", swatch: "bg-kerb", hex: "#1f5a3d" },
  REOPENED: {
    chip: "bg-laterite-wash text-laterite-deep border-laterite/30",
    swatch: "bg-laterite",
    hex: "#b0431c"
  },
  REJECTED: { chip: "bg-paper-deep text-muted border-rule", swatch: "bg-rule", hex: "#a39b88" },
  DUPLICATE: { chip: "bg-paper-deep text-muted border-rule", swatch: "bg-rule", hex: "#a39b88" }
};
