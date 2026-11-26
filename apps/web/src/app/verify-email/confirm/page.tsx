import type { Metadata } from "next";
import { ConfirmEmail } from "@/components/auth/confirm-email";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default async function ConfirmEmailPage() {
  const user = await getSession();
  return (
    <RecoveryShell eyebrow="Confirm your email" title="Confirm your email address">
      <ConfirmEmail signedIn={Boolean(user)} />
    </RecoveryShell>
  );
}
