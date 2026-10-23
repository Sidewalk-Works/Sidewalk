import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-form";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/lib/format";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to follow your reports"
      intro="See what has changed on the issues you reported, add evidence and answer questions from staff."
    >
      {sp.notice === "password-reset" && (
        <Alert tone="success" className="mb-6" title="Password changed">
          Sign in with your new password.
        </Alert>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
