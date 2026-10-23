import type { Metadata } from "next";
import { RecoveryShell } from "@/components/auth/recovery-shell";
import { VerifyPending } from "@/components/auth/verify-pending";
import { safeNext } from "@/lib/format";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false }
};

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const user = await getSession();
  return (
    <RecoveryShell
      eyebrow="Confirm your email"
      title={user?.emailVerified ? "You are all set" : "Check your email"}
    >
      <VerifyPending
        email={user?.email ?? null}
        verified={Boolean(user?.emailVerified)}
        signedIn={Boolean(user)}
        justRegistered={sp.sent === "1"}
        next={safeNext(sp.next, "/report")}
      />
    </RecoveryShell>
  );
}
