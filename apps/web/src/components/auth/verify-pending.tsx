"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";
import { useHydrated } from "@/lib/use-hydrated";

const PENDING_KEY = "sw_pending_email";
const COOLDOWN_SECONDS = 60;

interface Props {
  /** Present when the visitor is signed in with an unconfirmed address. */
  email: string | null;
  verified: boolean;
  signedIn: boolean;
  justRegistered: boolean;
  next: string;
}

function rememberedEmail(): string {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * "Check your email", with a resend that never reveals whether an address has an account. A signed-in person
 * is told about the cooldown on their own account; a signed-out person always gets the same neutral answer.
 */
export function VerifyPending({ email, verified, signedIn, justRegistered, next }: Props) {
  const hydrated = useHydrated();
  const [typed, setTyped] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const address = typed ?? (hydrated ? rememberedEmail() : "");

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const resend = useAction(async () => {
    const body = signedIn ? {} : { email: address.trim() };
    const res = await api<{ status: string }>("/auth/verification/resend", {
      method: "POST",
      json: body
    });
    if (res.status === "cooldown") {
      setMessage(
        "We sent a link a moment ago. Give it a minute, then check your spam folder before asking again."
      );
    } else {
      setMessage(
        signedIn
          ? "A new link is on its way. It replaces the earlier one."
          : "If that address has a Sidewalk account waiting to be confirmed, a new link is on its way."
      );
    }
    setWait(COOLDOWN_SECONDS);
  });

  if (verified) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Your email address is confirmed">
          You can file reports, comment and follow updates.
        </Alert>
        <ButtonLink href={next}>Continue</ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(justRegistered || signedIn) && (
        <Alert
          tone="info"
          title={justRegistered && !signedIn ? "Your account is created" : "One step left"}
        >
          {signedIn && email ? (
            <>
              We sent a confirmation link to{" "}
              <strong className="[overflow-wrap:anywhere]">{email}</strong>.
            </>
          ) : (
            "We sent a confirmation link to the address you gave us."
          )}{" "}
          Open it on this device or any other. It works once and expires in 24 hours.
        </Alert>
      )}
      {!justRegistered && !signedIn && (
        <p>
          If you have just created an account, we emailed you a confirmation link. Open it to
          finish.
        </p>
      )}

      <section aria-labelledby="no-email" className="border-t-2 border-ink pt-6">
        <h2 id="no-email" className="font-sans text-lg font-bold tracking-tight text-ink">
          Nothing in your inbox?
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.975rem]">
          <li>Look in spam or promotions. The sender is Sidewalk.</li>
          <li>Wait a minute or two. Delivery is not always instant.</li>
          <li>Check the address for typos.</li>
        </ul>

        <form
          method="post"
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            void resend.run();
          }}
        >
          {!signedIn && (
            <Field
              label="Email address"
              hint="We will not tell you whether an account exists for it."
              error={resend.fieldError("email")}
            >
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={address}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
          )}
          {resend.error && (
            <Alert tone="error">
              {resend.error.code === "NETWORK" || resend.error.status === 429
                ? resend.error.message
                : "We could not send that. Please try again in a moment."}
            </Alert>
          )}
          <div aria-live="polite">{message && <Alert tone="success">{message}</Alert>}</div>
          <Button
            type="submit"
            variant="secondary"
            loading={resend.pending}
            disabled={!hydrated || wait > 0 || (!signedIn && address.trim().length < 5)}
          >
            {wait > 0 ? `Send another link in ${wait}s` : "Send me a new link"}
          </Button>
        </form>
      </section>

      <p className="text-[0.95rem]">
        {signedIn ? (
          <>
            You can keep reading in the meantime.{" "}
            <Link href="/issues" className="link font-semibold">
              Explore reports
            </Link>
          </>
        ) : (
          <>
            Already confirmed?{" "}
            <Link href="/login" className="link font-semibold">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
