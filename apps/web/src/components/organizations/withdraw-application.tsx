"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

export function WithdrawApplication({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const withdraw = useAction(async () => {
    await api(`/organization-applications/${id}/withdraw`, { method: "POST", json: {} });
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Withdraw application
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Withdraw this application?"
        description="Staff will stop reviewing it. You can start a new application later."
      >
        <div className="space-y-5">
          {withdraw.error && <Alert tone="error">{withdraw.error.message}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={withdraw.pending} onClick={() => void withdraw.run()}>
              Withdraw
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
