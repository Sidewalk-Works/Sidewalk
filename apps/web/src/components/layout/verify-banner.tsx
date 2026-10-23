import Link from "next/link";
import { getSession } from "@/lib/server-api";

/** Shown on every page to a signed-in person whose email address is not confirmed yet, and says what that limits. */
export async function VerifyBanner() {
  const user = await getSession();
  if (!user || user.emailVerified) return null;
  return (
    <div
      role="region"
      aria-label="Email confirmation needed"
      className="border-b-2 border-ink bg-signal-wash"
    >
      <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-[0.95rem]">
        <p>
          <strong>Confirm your email address</strong> to file reports and comment. Until then you
          can read everything.
        </p>
        <Link
          href="/verify-email"
          className="font-semibold underline decoration-2 underline-offset-4"
        >
          Check your email or resend the link
        </Link>
      </div>
    </div>
  );
}
