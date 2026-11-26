"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORGANIZATION_LIMITS as L, type ReportOrganizationDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

/** Staff: confirm a suggested connection or remove one that does not belong. The reason goes to the audit log only. */
export function StaffConnections({
  reference,
  items
}: {
  reference: string;
  items: ReportOrganizationDto[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<{
    slug: string;
    name: string;
    status: "ACTIVE" | "REMOVED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const apply = useAction(async () => {
    if (!target) return;
    await api(`/moderation/reports/${reference}/organizations`, {
      method: "POST",
      json: { organizationSlug: target.slug, status: target.status, reason: reason.trim() }
    });
    setTarget(null);
    setReason("");
    router.refresh();
  });
  if (items.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-rule pt-4">
      <h3 className="font-semibold">Connected organizations</h3>
      <ul className="space-y-2 text-[0.9rem]">
        {items.map((r) => (
          <li
            key={r.organization.slug}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              {r.organization.name}{" "}
              <span className="text-muted">({r.status.toLowerCase().replace("_", " ")})</span>
            </span>
            <span className="flex gap-2">
              {r.status !== "ACTIVE" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setTarget({
                      slug: r.organization.slug,
                      name: r.organization.name,
                      status: "ACTIVE"
                    })
                  }
                >
                  Confirm
                  <span className="sr-only"> {r.organization.name}</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  setTarget({
                    slug: r.organization.slug,
                    name: r.organization.name,
                    status: "REMOVED"
                  })
                }
              >
                Remove
                <span className="sr-only"> {r.organization.name}</span>
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={
          target?.status === "REMOVED" ? `Remove ${target.name}?` : `Confirm ${target?.name ?? ""}?`
        }
        description="The connection changes publicly. Your reason is kept in the audit log, not shown on the report."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void apply.run();
          }}
        >
          {apply.error && <Alert tone="error">{apply.error.message}</Alert>}
          <Field label="Reason" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={L.governanceReason.max}
              className="min-h-24"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              loading={apply.pending}
              disabled={reason.trim().length < L.governanceReason.min}
            >
              Save
            </Button>
            <Button variant="quiet" onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
