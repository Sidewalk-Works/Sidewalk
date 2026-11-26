"use client";

import clsx from "clsx";
import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";

const control =
  "block w-full rounded-[2px] border-2 border-ink/70 bg-surface px-3.5 py-3 text-[1rem] text-ink placeholder:text-muted/80 transition-colors hover:border-ink aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-wash/40 disabled:bg-paper-deep disabled:text-muted";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
  }>;
  className?: string;
}

/** Label, hint and error wired to the control for screen readers. Errors are announced politely. */
export function Field({ label, hint, error, required, optional, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 font-semibold text-ink"
      >
        <span>{label}</span>
        {optional && <span className="text-[0.8125rem] font-normal text-muted">Optional</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-[0.9rem] leading-snug text-muted">
          {hint}
        </p>
      )}
      {isValidElement(children) &&
        cloneElement(children, {
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
          "aria-required": required || undefined
        })}
      {/* The line is always reserved, so validating on blur never shifts the layout under a pointer mid-click. */}
      <p
        id={errorId}
        role={error ? "alert" : undefined}
        className="min-h-[1.4rem] text-[0.9rem] font-medium leading-snug text-danger"
      >
        {error}
      </p>
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={clsx(control, "min-h-32 resize-y leading-relaxed", className)} {...rest} />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        control,
        "appearance-none bg-[length:1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10",
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2314201a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: ReactNode;
}

export function Checkbox({ label, hint, className, id, ...rest }: CheckProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={clsx("flex items-start gap-3", className)}>
      <input
        id={cid}
        type="checkbox"
        className="mt-1 size-6 shrink-0 cursor-pointer accent-laterite"
        {...rest}
      />
      <label htmlFor={cid} className="cursor-pointer leading-snug">
        <span className="font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[0.9rem] text-muted">{hint}</span>}
      </label>
    </div>
  );
}
