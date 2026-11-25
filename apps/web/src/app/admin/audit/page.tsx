import type { Paginated } from "@sidewalk/contracts";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { requireAdmin, serverFetch } from "@/lib/server-api";

interface Entry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  actorName: string;
  createdAt: string;
}

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin("/admin/audit");
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<Entry>>(`/admin/audit?page=${page}&pageSize=25`);
  return (
    <section aria-labelledby="audit">
      <h2 id="audit" className="display-md">
        Audit log
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        Privileged actions across the platform. The log is append-only and never contains passwords,
        tokens or message text.
      </p>
      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-t-2 border-ink text-left">
          <caption className="sr-only">Audit log entries, newest first</caption>
          <thead>
            <tr className="border-b border-rule text-[0.8rem] uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4">
                When
              </th>
              <th scope="col" className="py-3 pr-4">
                Who
              </th>
              <th scope="col" className="py-3 pr-4">
                Action
              </th>
              <th scope="col" className="py-3">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id} className="border-b border-rule align-top text-[0.9rem]">
                <td className="whitespace-nowrap py-3 pr-4">{formatDateTime(a.createdAt)}</td>
                <td className="py-3 pr-4">{a.actorName}</td>
                <td className="py-3 pr-4 font-mono text-[0.8rem]">{a.action}</td>
                <td className="py-3 font-mono text-[0.75rem] text-muted">
                  {Object.entries(a.metadata)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join("  ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <p className="py-8 text-muted">No audited actions yet.</p>}
      </div>
      <div className="mt-8">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(p) => `/admin/audit?page=${p}`}
        />
      </div>
    </section>
  );
}
