import type { ReactNode } from "react";

/** One calm column for steps people reach from an email: say what happened, what to do next, nothing else. */
export function RecoveryShell({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="wrap py-14 lg:py-20">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-lg mt-3">{title}</h1>
        <div className="mt-8 space-y-6 text-[1.05rem] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </div>
  );
}
