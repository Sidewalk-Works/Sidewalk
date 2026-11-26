"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LIMITS } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/client-api";
import { hardNavigate } from "@/lib/navigate";
import { useHydrated } from "@/lib/use-hydrated";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(LIMITS.displayName.min, `Your name must be at least ${LIMITS.displayName.min} characters.`)
    .max(LIMITS.displayName.max),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z
    .string()
    .min(LIMITS.password.min, `Use at least ${LIMITS.password.min} characters.`)
    .max(LIMITS.password.max)
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function LoginForm({ next }: { next: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });
  const { errors, isSubmitting } = form.formState;
  const hydrated = useHydrated();

  return (
    <form
      noValidate
      method="post"
      className="space-y-6"
      onSubmit={form.handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/auth/login", { method: "POST", json: values });
          hardNavigate(next);
          // Keep the form busy until the browser leaves the page.
          await new Promise(() => undefined);
        } catch (e) {
          setFormError(
            e instanceof ApiError ? e.message : "Something went wrong. Please try again."
          );
        }
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Email address" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={errors.password?.message} required>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <p className="-mt-3 text-[0.95rem]">
        <Link href="/forgot-password" className="link font-semibold">
          Forgot your password?
        </Link>
      </p>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        disabled={!hydrated}
      >
        Sign in
      </Button>
      <p className="text-center text-[0.95rem]">
        New to Sidewalk?{" "}
        <Link
          href={`/register${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="link font-semibold"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "" }
  });
  const { errors, isSubmitting } = form.formState;
  const hydrated = useHydrated();

  return (
    <form
      noValidate
      method="post"
      className="space-y-6"
      onSubmit={form.handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/auth/register", { method: "POST", json: values });
          // Registration does not sign anyone in. Remember the address for this tab only, so the pending
          // page can offer a resend without putting an email address in a URL.
          try {
            window.sessionStorage.setItem("sw_pending_email", values.email);
          } catch {
            /* private mode: the pending page simply asks for the address */
          }
          router.push(
            `/verify-email?sent=1${next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}`
          );
        } catch (e) {
          if (e instanceof ApiError) {
            // Show the server's per-field messages next to the fields they belong to.
            let placed = false;
            for (const d of e.details) {
              if (d.field === "email" || d.field === "password" || d.field === "displayName") {
                form.setError(d.field, { message: d.message });
                placed = true;
              }
            }
            if (!placed) setFormError(e.message);
          } else {
            setFormError("Something went wrong. Please try again.");
          }
        }
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field
        label="Your name"
        hint="Shown on your comments. On reports it is shown only if you choose."
        error={errors.displayName?.message}
        required
      >
        <Input autoComplete="name" {...form.register("displayName")} />
      </Field>
      <Field
        label="Email address"
        hint="Used to sign in. Never shown publicly."
        error={errors.email?.message}
        required
      >
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field
        label="Password"
        hint={`At least ${LIMITS.password.min} characters. A few random words works well.`}
        error={errors.password?.message}
        required
      >
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        disabled={!hydrated}
      >
        Create account
      </Button>
      <p className="text-[0.85rem] text-muted">
        We will email you a link to confirm your address. Until you do, you can read everything but
        not file reports or comment.
      </p>
      <p className="text-[0.85rem] text-muted">
        By creating an account you agree to the{" "}
        <Link href="/guidelines" className="underline">
          community guidelines
        </Link>
        . Read how we handle your data in the{" "}
        <Link href="/privacy" className="underline">
          privacy notice
        </Link>
        .
      </p>
      <p className="text-center text-[0.95rem]">
        Already have an account?{" "}
        <Link
          href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="link font-semibold"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
