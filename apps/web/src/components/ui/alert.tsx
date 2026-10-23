import clsx from "clsx";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

const styles = {
  error: { wrap: "border-danger bg-danger-wash text-ink", icon: CircleAlert, color: "text-danger" },
  success: { wrap: "border-kerb bg-kerb-wash text-ink", icon: CircleCheck, color: "text-kerb" },
  info: { wrap: "border-ink/40 bg-paper-deep text-ink", icon: Info, color: "text-ink-soft" },
  warn: { wrap: "border-signal bg-signal-wash text-ink", icon: CircleAlert, color: "text-signal" }
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className
}: {
  tone?: keyof typeof styles;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const s = styles[tone];
  const Icon = s.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("flex gap-3 rounded-[2px] border-l-4 px-4 py-3", s.wrap, className)}
    >
      <Icon className={clsx("mt-0.5 size-5 shrink-0", s.color)} aria-hidden />
      <div className="min-w-0 text-[0.975rem] leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}
