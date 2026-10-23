import type { ReactNode } from "react";

/** Empty states explain what would be here and what to do next. They never invent activity. */
export function EmptyState({
  title,
  children,
  action
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-y border-dashed border-ink/40 px-1 py-10 sm:py-14">
      <h3 className="display-md max-w-xl">{title}</h3>
      {children && <div className="mt-3 max-w-xl text-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
