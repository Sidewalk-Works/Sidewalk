"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";
import { useHashToken } from "@/lib/use-hash-token";

type Outcome = "ready" | "done" | "expired" | "invalid";

/**
 * Landing page for the confirmation link. Confirming is a deliberate click, not something that happens on load:
 * that keeps mail scanners and link previewers from using up a single-use link.
 */
export function ConfirmEmail({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const { ready, token } = useHashToken();
  const [outcome, setOutcome] = useState<Outcome>("ready");

  const confirm = useAction(async () => {
    try {
      await api("/auth/verification/confirm", { method: "POST", json: { token } });
      setOutcome("done");
      router.refresh(); // the banner and the header know about the new state straight away
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "TOKEN_EXPIRED") return setOutcome("expired");
      if (code === "TOKEN_INVALID") return setOutcome("invalid");
      throw e;
    }
  });

  if (!ready) return <p aria-live="polite">Checking your link…</p>;

  if (outcome === "done") {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Your email address is confirmed">
          You can now file reports, comment and follow what happens to them.
        </Alert>
        <ButtonLink href={signedIn ? "/report" : "/login?next=%2Freport"}>
          {signedIn ? "File a report" : "Sign in"}
        </ButtonLink>
      </div>
    );
  }

  if (outcome === "expired" || outcome === "invalid" || !token) {
    const expired = outcome === "expired";
    return (
      <div className="space-y-6">
        <Alert
          tone="warn"
          title={
            expired
              ? "This link has expired"
              : token
                ? "This link no longer works"
                : "This link is incomplete"
          }
        >
          {expired
            ? "Confirmation links last 24 hours. Request a new one and use it straight away."
            : token
              ? "It may have been used already, or replaced by a newer email. If you have already confirmed, you are done."
              : "Open the link from the email itself. If your email app broke it across two lines, copy the whole address into the browser."}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/verify-email">Get a new link</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p>One click confirms that this email address is yours.</p>
      {confirm.error && <Alert tone="error">{confirm.error.message}</Alert>}
      <Button size="lg" loading={confirm.pending} onClick={() => void confirm.run()}>
        Confirm my email address
      </Button>
      <p className="text-[0.9rem]">
        Not you?{" "}
        <Link href="/" className="link">
          Leave this page
        </Link>
        . Nothing changes unless you confirm.
      </p>
    </div>
  );
}
