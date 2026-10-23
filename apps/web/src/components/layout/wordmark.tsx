import Link from "next/link";

/** A kerb in profile: the pavement edge, one step up from the road. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex min-h-11 items-center gap-2.5 ${className ?? ""}`}
      aria-label="Sidewalk, home"
    >
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden fill="none">
        <path d="M2 22h8v-8h8V6h8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" />
        <path d="M2 26h24" stroke="#b0431c" strokeWidth="3.2" strokeLinecap="square" />
      </svg>
      <span className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.035em]">
        Sidewalk
      </span>
    </Link>
  );
}
