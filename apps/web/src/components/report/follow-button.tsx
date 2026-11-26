"use client";

import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

interface Props {
  reference: string;
  following: boolean;
  isOwner: boolean;
  signedIn: boolean;
  verified: boolean;
}

/** Follow a report to be told when it changes. Owners are always told, so they get an explanation instead. */
export function FollowButton({ reference, following, isOwner, signedIn, verified }: Props) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const toggle = useAction(async () => {
    await api(`/reports/${reference}/follow`, { method: on ? "DELETE" : "PUT" });
    setOn(!on);
    router.refresh();
  });

  if (isOwner)
    return (
      <p className="text-[0.875rem] text-muted">
        You will always be notified about updates to your own report.
      </p>
    );
  if (!signedIn) {
    return (
      <p className="text-[0.875rem] text-muted">
        <Link
          href={`/login?next=${encodeURIComponent(`/issues/${reference}`)}`}
          className="link font-semibold"
        >
          Sign in
        </Link>{" "}
        to follow this report and be told when it changes.
      </p>
    );
  }
  if (!verified) {
    return (
      <p className="text-[0.875rem] text-muted">
        <Link href="/verify-email" className="link font-semibold">
          Confirm your email
        </Link>{" "}
        to follow this report.
      </p>
    );
  }
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={on}
        loading={toggle.pending}
        onClick={() => void toggle.run()}
        icon={
          on ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />
        }
      >
        {on ? "Stop following" : "Follow this report"}
      </Button>
      <p className="mt-1.5 text-[0.8125rem] text-muted" aria-live="polite">
        {on
          ? "You will be told when its status changes or someone comments."
          : "Be told when its status changes or someone comments."}
      </p>
      {toggle.error && (
        <p role="alert" className="mt-1 text-[0.85rem] text-danger">
          {toggle.error.message}
        </p>
      )}
    </div>
  );
}
