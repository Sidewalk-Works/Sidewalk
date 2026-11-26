"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";
import { announceUnread } from "@/lib/unread-count";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const mark = useAction(async () => {
    await api("/notifications/read-all", { method: "POST", json: {} });
    announceUnread({ set: 0 });
    router.refresh();
  });
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        loading={mark.pending}
        disabled={disabled}
        onClick={() => void mark.run()}
      >
        Mark all as read
      </Button>
      {mark.error && (
        <p role="alert" className="mt-1 text-[0.85rem] text-danger">
          {mark.error.message}
        </p>
      )}
    </div>
  );
}
