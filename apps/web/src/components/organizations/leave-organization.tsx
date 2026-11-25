"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

export function LeaveOrganization({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const leave = useAction(async () => {
    await api(`/organizations/${slug}/leave`, { method: "POST", json: {} });
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)}>
        Leave
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${name}?`}
        description="You will no longer be able to act for this organization. An administrator can invite you again. Your earlier statements stay on the record."
      >
        <div className="space-y-5">
          {leave.error && <Alert tone="error">{leave.error.message}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={leave.pending} onClick={() => void leave.run()}>
              Leave organization
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
