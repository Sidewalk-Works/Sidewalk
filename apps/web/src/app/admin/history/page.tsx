import Link from "next/link";
import {
  MODERATION_POLICY_LABELS,
  type ModerationActionDto,
  type Paginated
} from "@sidewalk/contracts";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { serverFetch } from "@/lib/server-api";

export default async function HistoryPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<ModerationActionDto>>(
    `/moderation/actions?page=${page}&pageSize=20`
  );
  return (
    <section aria-labelledby="history">
      <h2 id="history" className="display-md">
        Moderation history
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        Every hide, removal, restoration and dismissed flag, with the reason given. Entries cannot
        be edited.
      </p>
      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-t-2 border-ink text-left">
          <caption className="sr-only">Moderation decisions, newest first</caption>
          <thead>
            <tr className="border-b border-rule text-[0.8rem] uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4">
                When
              </th>
              <th scope="col" className="py-3 pr-4">
                Decision
              </th>
              <th scope="col" className="py-3 pr-4">
                Policy
              </th>
              <th scope="col" className="py-3 pr-4">
                Reason
              </th>
              <th scope="col" className="py-3">
                Moderator
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id} className="border-b border-rule align-top text-[0.925rem]">
                <td className="py-3.5 pr-4 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                <td className="py-3.5 pr-4">
                  <span className="font-semibold">{a.action.toLowerCase()}</span>{" "}
                  {a.target.toLowerCase()}
                  <br />
                  <Link
                    href={`/issues/${a.reportReference}`}
                    className="font-mono text-[0.78rem] underline"
                  >
                    {a.reportReference}
                  </Link>
                  <span className="block text-[0.78rem] text-muted">
                    {a.previousState.toLowerCase()} → {a.newState.toLowerCase()}
                  </span>
                </td>
                <td className="py-3.5 pr-4">
                  {a.policy ? MODERATION_POLICY_LABELS[a.policy] : "—"}
                </td>
                <td className="py-3.5 pr-4 max-w-md">{a.reason}</td>
                <td className="py-3.5">{a.moderatorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && (
          <p className="py-8 text-muted">No moderation decisions have been recorded yet.</p>
        )}
      </div>
      <div className="mt-8">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(p) => `/admin/history?page=${p}`}
        />
      </div>
    </section>
  );
}
