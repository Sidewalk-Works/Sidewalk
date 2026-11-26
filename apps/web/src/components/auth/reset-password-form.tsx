"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LIMITS } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/client-api";
import { useHashToken } from "@/lib/use-hash-token";

const schema = z
  .object({
    password: z
      .string()
      .min(LIMITS.password.min, `Use at least ${LIMITS.password.min} characters.`)
      .max(LIMITS.password.max),
    confirm: z.string()
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The two passwords do not match."
  });
type Values = z.infer<typeof schema>;
type State = "checking" | "form" | "expired" | "invalid" | "done";

export function ResetPasswordForm() {
  const { ready, token } = useHashToken();
  const [state, setState] = useState<State>("checking");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" }
  });
  const { errors, isSubmitting } = form.formState;

  // Ask the server whether the link is still good before the person types anything.
  useEffect(() => {
    if (!ready) return;
    if (!token) {
      queueMicrotask(() => setState("invalid"));
      return;
    }
    let cancelled = false;
    api<{ valid: boolean; reason?: "expired" | "invalid" }>("/auth/password/reset/check", {
      method: "POST",
      json: { token }
    })
      .then(
        (r) =>
          !cancelled && setState(r.valid ? "form" : r.reason === "expired" ? "expired" : "invalid")
      )
      .catch(() => !cancelled && setState("form")); // if the check itself fails, let the real submit decide
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  async function submit(values: Values) {
    setFormError(null);
    try {
      await api("/auth/password/reset", {
        method: "POST",
        json: { token, password: values.password }
      });
      setState("done");
    } catch (e) {
      if (!(e instanceof ApiError)) return setFormError("Something went wrong. Please try again.");
      if (e.code === "TOKEN_EXPIRED") return setState("expired");
      if (e.code === "TOKEN_INVALID") return setState("invalid");
      const detail = e.details.find((d) => d.field === "password");
      if (detail) form.setError("password", { message: detail.message });
      else setFormError(e.message);
    }
  }

  if (state === "checking") return <p aria-live="polite">Checking your link…</p>;

  if (state === "done") {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Your password has been changed">
          For your security you were signed out on every device, and we emailed a confirmation. Sign
          in with your new password.
        </Alert>
        <ButtonLink href="/login?notice=password-reset">Sign in</ButtonLink>
      </div>
    );
  }

  if (state === "expired" || state === "invalid") {
    return (
      <div className="space-y-6">
        <Alert
          tone="warn"
          title={
            state === "expired"
              ? "This link has expired"
              : token
                ? "This link no longer works"
                : "This link is incomplete"
          }
        >
          {state === "expired"
            ? "Reset links last 30 minutes. Request a new one and use it straight away."
            : token
              ? "It may have been used already, or replaced because you asked for a newer one. If you did not ask for it, you do not need to do anything."
              : "Open the link from the email itself. If your email app broke it across two lines, copy the whole address into the browser."}
        </Alert>
        <ButtonLink href="/forgot-password">Request a new link</ButtonLink>
      </div>
    );
  }

  return (
    <form noValidate method="post" className="space-y-6" onSubmit={form.handleSubmit(submit)}>
      <p>
        Choose a new password. Signing in again is required afterwards, and every device is signed
        out.
      </p>
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field
        label="New password"
        hint={`At least ${LIMITS.password.min} characters. A few random words works well.`}
        error={errors.password?.message}
        required
      >
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Type it again" error={errors.confirm?.message} required>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Change my password
      </Button>
    </form>
  );
}
