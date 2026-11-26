"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

/** `label` names the message ("password_changed email to d***@example.org"), so a screen reader hears which one. */
export function RetryEmailButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const retry = useAction(async () => {
    await api(`/admin/email-outbox/${id}/retry`, { method: "POST", json: {} });
    router.refresh();
  });
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        loading={retry.pending}
        aria-label={`Retry ${label}`}
        onClick={() => void retry.run()}
      >
        Retry
      </Button>
      {retry.error && (
        <p role="alert" className="mt-1 max-w-40 text-[0.75rem] text-danger">
          {retry.error.message}
        </p>
      )}
    </div>
  );
}
