import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[2px] border-2 font-semibold leading-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-laterite text-white border-laterite hover:bg-laterite-deep hover:border-laterite-deep",
  secondary: "bg-transparent text-ink border-ink hover:bg-ink hover:text-paper",
  quiet:
    "bg-transparent text-ink border-transparent hover:border-rule underline underline-offset-4 decoration-rule hover:decoration-ink",
  danger: "bg-transparent text-danger border-danger hover:bg-danger hover:text-white"
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-2 text-[0.9rem] min-h-9",
  md: "px-5 py-3 text-[1rem] min-h-11",
  lg: "px-7 py-4 text-[1.0625rem] min-h-14"
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  clsx(base, variants[variant], sizes[size], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
      {icon}
    </Link>
  );
}
