import type { Metadata } from "next";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default function ResetPasswordPage() {
  return (
    <RecoveryShell eyebrow="Account recovery" title="Choose a new password">
      <ResetPasswordForm />
    </RecoveryShell>
  );
}
