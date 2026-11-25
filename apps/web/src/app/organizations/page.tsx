import type { Metadata } from "next";
import Link from "next/link";
import {
  ADMINISTRATIVE_LEVELS,
  ADMINISTRATIVE_LEVEL_INFO,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_INFO,
  type OrganizationSummaryDto,
  type Paginated
} from "@sidewalk/contracts";
import { OrganizationBadge } from "@/components/organizations/org-badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Organizations",
  description:
    "Public institutions on Sidewalk. “Verified” means Sidewalk staff reviewed evidence of identity; it does not vouch for what an organization says."
};

type SP = {
  q?: string;
  type?: string;
  level?: string;
  jurisdiction?: string;
  verified?: string;
  page?: string;
};

const field = "min-h-11 w-full border-2 border-ink/70 bg-surface px-3 text-[1rem] hover:border-ink";

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const jurisdiction = (sp.jurisdiction ?? "").slice(0, 100);
  const type = (ORGANIZATION_TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type : "";
  const level = (ADMINISTRATIVE_LEVELS as readonly string[]).includes(sp.level ?? "")
    ? sp.level
    : "";
  const verified = sp.verified === "true" ? "true" : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const params = new URLSearchParams({ page: String(page), pageSize: "12" });
  if (q) params.set("q", q);
  if (jurisdiction) params.set("jurisdiction", jurisdiction);
  if (type) params.set("type", type);
  if (level) params.set("level", level);
  if (verified) params.set("verified", verified);
  const data = await serverFetch<Paginated<OrganizationSummaryDto>>(
    `/organizations?${params.toString()}`
  );
  const filtered = Boolean(q || jurisdiction || type || level || verified);
  const keep = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (jurisdiction) next.set("jurisdiction", jurisdiction);
    if (type) next.set("type", type);
    if (level) next.set("level", level);
    if (verified) next.set("verified", verified);
    next.set("page", String(p));
    return `/organizations?${next.toString()}`;
  };

  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">Organizations</p>
        <h1 className="display-lg mt-3">Who is answering for what</h1>
        <p className="mt-5 text-[1.2rem] leading-relaxed text-ink-soft">
          Public institutions that have a profile on Sidewalk. A <strong>verified</strong>{" "}
          organization is one whose identity Sidewalk staff checked; it can post official responses
          to reports. Verification says who is speaking. It does not say the statement is true.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/organizations/apply" variant="primary">
            Apply to represent an organization
          </ButtonLink>
          <ButtonLink href="/organizations/mine" variant="secondary">
            My organizations
          </ButtonLink>
        </div>
      </header>

      <form
        role="search"
        aria-label="Find an organization"
        className="mt-8 grid gap-4 md:grid-cols-6"
      >
        <div className="md:col-span-2">
          <label htmlFor="oq" className="mb-1 block font-semibold">
            Name
          </label>
          <input id="oq" name="q" defaultValue={q} className={field} maxLength={100} />
        </div>
        <div>
          <label htmlFor="oj" className="mb-1 block font-semibold">
            Area
          </label>
          <input
            id="oj"
            name="jurisdiction"
            defaultValue={jurisdiction}
            className={field}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="ot" className="mb-1 block font-semibold">
            Kind
          </label>
          <select id="ot" name="type" defaultValue={type} className={field}>
            <option value="">Any</option>
            {ORGANIZATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORGANIZATION_TYPE_INFO[t].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ol" className="mb-1 block font-semibold">
            Level
          </label>
          <select id="ol" name="level" defaultValue={level} className={field}>
            <option value="">Any</option>
            {ADMINISTRATIVE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {ADMINISTRATIVE_LEVEL_INFO[l].label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              name="verified"
              value="true"
              defaultChecked={Boolean(verified)}
              className="size-6 accent-laterite"
            />
            Verified only
          </label>
          <button className="min-h-11 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper">
            Search
          </button>
        </div>
      </form>

      <section aria-labelledby="results" className="mt-8">
        <h2 id="results" className="eyebrow">
          {data.total} {data.total === 1 ? "organization" : "organizations"}
          {filtered ? " match" : ""}
        </h2>
        {data.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={
                filtered ? "No organization matches that search" : "No organizations are listed yet"
              }
              action={
                filtered ? (
                  <Link
                    href="/organizations"
                    className="font-semibold underline underline-offset-4"
                  >
                    Clear the search
                  </Link>
                ) : undefined
              }
            >
              {filtered
                ? "Try fewer words, or a different area. Organizations only appear here once a profile is listed."
                : "Profiles appear here once Sidewalk staff list them, usually when an application is approved."}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 border-t-2 border-ink">
            {data.items.map((o) => (
              <li key={o.slug} className="border-b border-rule py-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="display-md">
                    <Link
                      href={`/organizations/${o.slug}`}
                      className="underline decoration-laterite decoration-2 underline-offset-4"
                    >
                      {o.name}
                    </Link>
                  </h3>
                  <OrganizationBadge org={o} />
                </div>
                <p className="mt-2 text-[0.9rem] text-muted">
                  {ORGANIZATION_TYPE_INFO[o.type].label} ·{" "}
                  {ADMINISTRATIVE_LEVEL_INFO[o.level].label} · {o.jurisdiction}
                </p>
                {o.excerpt && <p className="mt-2 max-w-2xl text-ink-soft">{o.excerpt}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={keep} />
        </div>
      </section>
    </div>
  );
}
