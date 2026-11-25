import clsx from "clsx";
import Link from "next/link";
import {
  ORGANIZATION_TYPE_INFO,
  type OrganizationBadgeDto,
  type OrganizationType,
  type Paginated
} from "@sidewalk/contracts";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/format";
import { serverFetch } from "@/lib/server-api";

interface Row extends OrganizationBadgeDto {
  id: string;
  type: OrganizationType;
  jurisdiction: string;
  publicProfile: boolean;
  members: number;
  createdAt: string;
}

const TABS = [
  { key: "ALL", label: "All" },
  { key: "UNVERIFIED", label: "Not verified" },
  { key: "VERIFIED", label: "Verified" },
  { key: "REVOKED", label: "Verification withdrawn" },
  { key: "SUSPENDED", label: "Suspended" }
];

export default async function OrganizationListPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const state = TABS.some((t) => t.key === sp.state) ? (sp.state as string) : "ALL";
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<Row>>(
    `/moderation/organizations?state=${state}&q=${encodeURIComponent(q)}&page=${page}&pageSize=20`
  );
  const href = (s: string, p = 1) =>
    `/admin/organizations/list?state=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <section aria-labelledby="orgs" className="space-y-6">
      <h3 id="orgs" className="sr-only">
        All organizations
      </h3>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav aria-label="Organization state" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={state === t.key ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center border-2 border-ink px-4 font-semibold",
                state === t.key ? "bg-ink text-paper" : "hover:bg-paper-deep"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          <input type="hidden" name="state" value={state} />
          <label htmlFor="oq" className="sr-only">
            Search organizations
          </label>
          <input
            id="oq"
            name="q"
            defaultValue={q}
            placeholder="Name or area"
            className="min-h-11 border-2 border-ink/70 bg-surface px-3"
          />
          <button className="min-h-11 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper">
            Search
          </button>
        </form>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="No organizations match." />
      ) : (
        <ul className="border-t-2 border-ink">
          {data.items.map((o) => (
            <li key={o.id} className="grid gap-2 border-b border-rule py-5 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-display text-[1.3rem] leading-tight">
                  <Link
                    href={`/admin/organizations/${o.id}`}
                    className="underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {o.name}
                  </Link>
                </p>
                <p className="mt-1 text-[0.875rem] text-muted">
                  {ORGANIZATION_TYPE_INFO[o.type].label} · {o.jurisdiction} · {o.members} member
                  {o.members === 1 ? "" : "s"} · created {formatDate(o.createdAt)} ·{" "}
                  {o.publicProfile ? "listed publicly" : "not listed"}
                </p>
              </div>
              <OrganizationBadge org={o} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => href(state, p)} />
    </section>
  );
}
