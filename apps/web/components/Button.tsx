import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export function Button({ isLoading, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className="button" disabled={disabled ?? isLoading} {...rest}>
      {isLoading ? "Loading..." : children}
    </button>
  );
}
