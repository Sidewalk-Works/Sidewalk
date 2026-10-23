import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  intro,
  children
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-lg mt-3">{title}</h1>
        {intro && <p className="mt-5 text-[1.2rem] leading-relaxed text-ink-soft">{intro}</p>}
      </header>
      <div className="mt-12 grid gap-x-16 gap-y-14 lg:grid-cols-[14rem_1fr]">{children}</div>
    </div>
  );
}

/** A labelled section in the long-form layout: small heading in the margin, text in the measure. */
export function Block({
  id,
  heading,
  children
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <>
      <h2 id={id} className="eyebrow !text-ink lg:pt-2">
        {heading}
      </h2>
      <div
        aria-labelledby={id}
        role="region"
        className="prose-sidewalk max-w-2xl [&_h3]:mt-8 [&_h3]:font-sans [&_h3]:text-lg [&_h3]:font-bold [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </div>
    </>
  );
}
