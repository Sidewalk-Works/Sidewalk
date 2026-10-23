import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/format";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: true }
};

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);
  return (
    <AuthShell
      eyebrow="Join Sidewalk"
      title="Create a free account to report an issue"
      intro="You only need a name, an email address and a password. Reading public reports never requires an account."
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
