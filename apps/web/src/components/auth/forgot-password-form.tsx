"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TOKEN_TTL } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/client-api";
import { useHydrated } from "@/lib/use-hydrated";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address.")
});
type Values = z.infer<typeof schema>;

/** The answer is always the same, so nobody can use this form to find out who has an account. */
export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  async function send(values: Values) {
    setError(null);
    try {
      await api("/auth/password/forgot", { method: "POST", json: values });
      setSentTo(values.email);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 429 || e.code === "NETWORK")
          ? e.message
          : "We could not send that just now. Please try again in a moment."
      );
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="If there is an account for that address, a link is on its way">
          It works once and expires in {TOKEN_TTL.passwordResetMinutes} minutes. For your security
          we do not say whether the address is registered.
        </Alert>
        <section aria-labelledby="no-mail" className="border-t-2 border-ink pt-6">
          <h2 id="no-mail" className="font-sans text-lg font-bold tracking-tight text-ink">
            Nothing arrived?
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.975rem]">
            <li>Check spam. The sender is Sidewalk.</li>
            <li>Make sure you typed the address you signed up with.</li>
            <li>Wait a couple of minutes, then ask again.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setSentTo(null)}>
              Try a different address
            </Button>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form noValidate method="post" className="space-y-6" onSubmit={form.handleSubmit(send)}>
      <p>
        Enter the email address you signed up with. We will send a link to choose a new password.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email address" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting} disabled={!hydrated}>
        Send the link
      </Button>
      <p className="text-[0.95rem]">
        Remembered it?{" "}
        <Link href="/login" className="link font-semibold">
          Sign in
        </Link>
      </p>
    </form>
  );
}
