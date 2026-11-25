"use client";

import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationSummaryDto, Paginated } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";
import { OrganizationBadge } from "./org-badge";

/**
 * Suggest (the reporter) or connect (staff) an organization. Nothing here assigns responsibility: the organization is
 * told it has been named, and decides for itself whether to respond.
 */
export function ConnectOrganization({
  reference,
  mode
}: {
  reference: string;
  mode: "suggest" | "assign";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OrganizationSummaryDto[] | null>(null);
  const search = useAction(async () => {
    const data = await api<Paginated<OrganizationSummaryDto>>(
      `/organizations?q=${encodeURIComponent(q.trim())}&pageSize=8`
    );
    setResults(data.items);
  });
  const choose = useAction(async (slug: string) => {
    await api(`/reports/${reference}/organizations`, {
      method: "POST",
      json: { organizationSlug: slug }
    });
    setOpen(false);
    setResults(null);
    setQ("");
    router.refresh();
  });
  const error = search.error ?? choose.error;

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        icon={<Landmark className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {mode === "suggest" ? "Suggest an organization" : "Connect an organization"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={mode === "suggest" ? "Suggest an organization" : "Connect an organization"}
        description={
          mode === "suggest"
            ? "Tell an organization this report may concern it. It is a suggestion, not an assignment: the organization decides whether to respond, and it is shown as suggested by you."
            : "Staff connections are shown publicly as assigned by Sidewalk staff. They do not mean the organization has accepted responsibility."
        }
      >
        <form
          className="space-y-3"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search.run();
          }}
        >
          {error && <Alert tone="error">{error.message}</Alert>}
          <Field
            label="Find an organization by name or area"
            hint="Only listed organizations can be suggested."
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          </Field>
          <Button type="submit" variant="secondary" loading={search.pending} disabled={!q.trim()}>
            Search
          </Button>
        </form>
        {results && (
          <ul
            className="mt-4 divide-y divide-rule border-y border-rule"
            aria-label="Search results"
          >
            {results.length === 0 && <li className="py-4 text-muted">No organization matches.</li>}
            {results.map((o) => (
              <li key={o.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-[0.85rem] text-muted">{o.jurisdiction}</p>
                  <OrganizationBadge org={o} className="mt-1" />
                </div>
                <Button size="sm" loading={choose.pending} onClick={() => void choose.run(o.slug)}>
                  {mode === "suggest" ? "Suggest" : "Connect"}
                  <span className="sr-only"> {o.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
