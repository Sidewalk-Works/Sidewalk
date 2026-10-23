import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  intro,
  children
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="wrap grid gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-24 lg:py-20">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-lg mt-3 max-w-xl">{title}</h1>
        <p className="mt-5 max-w-md text-lg text-ink-soft">{intro}</p>
        <ul className="mt-10 hidden max-w-md space-y-4 border-t-2 border-ink pt-6 text-[0.975rem] lg:block">
          <li>
            <strong>Your email stays private.</strong> It is used only to sign you in.
          </li>
          <li>
            <strong>You choose whether your name is public</strong> on each report you file.
          </li>
          <li>
            <strong>Photographs are cleaned.</strong> Location data hidden inside photos is removed
            before anything is stored.
          </li>
        </ul>
      </div>
      <div className="self-start border-2 border-ink bg-surface p-6 shadow-lift sm:p-8">
        {children}
      </div>
    </div>
  );
}
