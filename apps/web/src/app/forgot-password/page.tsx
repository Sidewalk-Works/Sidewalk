import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Forgot your password?",
  robots: { index: false, follow: true }
};

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/account");
  return (
    <RecoveryShell eyebrow="Account recovery" title="Forgot your password?">
      <ForgotPasswordForm />
    </RecoveryShell>
  );
}
