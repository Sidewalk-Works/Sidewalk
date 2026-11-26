import { formatNumber } from "@/lib/format";

export function Stat({ value, label, note }: { value: number; label: string; note?: string }) {
  return (
    <div className="border-t-2 border-ink pt-4">
      <p className="font-display text-[3.4rem] leading-none tracking-[-0.04em] [font-variant-numeric:lining-nums_tabular-nums] sm:text-[4.2rem]">
        {formatNumber(value)}
      </p>
      <p className="mt-2 font-semibold">{label}</p>
      {note && <p className="mt-1 text-[0.875rem] text-muted">{note}</p>}
    </div>
  );
}
