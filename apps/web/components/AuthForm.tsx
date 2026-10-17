"use client";

import { useState, type FormEvent } from "react";

import { loginSchema, registerSchema } from "@sidewalk/shared";

import { Button } from "./Button";
import { FormField } from "./FormField";

interface AuthFormProps {
  mode: "login" | "register";
  submitLabel: string;
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function AuthForm({ mode, submitLabel, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const schema = mode === "login" ? loginSchema : registerSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErrors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email") nextErrors.email = issue.message;
        if (key === "password") nextErrors.password = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit(parsed.data.email, parsed.data.password);
    } catch (error) {
      // #863: Map known server error codes to the relevant field so users see
      // an inline message next to the field rather than a generic banner.
      const message = error instanceof Error ? error.message : "Something went wrong.";
      if (mode === "register" && /email.*taken|already.*exists|duplicate.*email|EMAIL_TAKEN/i.test(message)) {
        setFieldErrors({ email: "An account with this email already exists." });
      } else if (/password/i.test(message)) {
        setFieldErrors({ password: message });
      } else {
        setFormError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <FormField
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        autoComplete="email"
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      {formError ? (
        <p role="alert" className="form-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
