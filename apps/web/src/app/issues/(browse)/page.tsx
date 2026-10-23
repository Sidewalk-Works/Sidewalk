import { List, Map as MapIcon, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  REPORT_STATUSES,
  STATUS_INFO,
  type CategoryDto,
  type Paginated,
  type ReportSummaryDto
} from "@sidewalk/contracts";
import { NearMeButton } from "@/components/issues/near-me-button";
import { ReportsMap } from "@/components/map/reports-map";
import { ReportRow } from "@/components/report/report-row";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatNumber } from "@/lib/format";
import { serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Explore community issues",
  description:
    "Search public reports of potholes, flooding, waste, streetlights and water problems, by place, category and status."
};

type Search = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SORTS = [
  { value: "activity", label: "Recent activity" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" }
];

export default async function IssuesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const view = first(sp.view) === "map" ? "map" : "list";
  const q = first(sp.q).trim().slice(0, 100);
  const category = first(sp.category);
  const status = first(sp.status);
  const sort = SORTS.some((s) => s.value === first(sp.sort)) ? first(sp.sort) : "activity";
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);
  const near = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(first(sp.near)) ? first(sp.near) : "";
  const radiusKm = Math.min(50, Math.max(0.1, Number(first(sp.radiusKm)) || 5));

  const filters = new URLSearchParams();
  if (q) filters.set("q", q);
  if (category) filters.set("category", category);
  if (status) filters.set("status", status);
  if (near) {
    filters.set("near", near);
    filters.set("radiusKm", String(radiusKm));
  }

  const apiQuery = new URLSearchParams(filters);
  apiQuery.set("sort", sort);
  apiQuery.set("page", String(page));
  apiQuery.set("pageSize", "12");

  const [categories, results] = await Promise.all([
    serverFetch<{ items: CategoryDto[] }>("/categories"),
    view === "list"
      ? serverFetch<Paginated<ReportSummaryDto>>(`/reports?${apiQuery}`)
      : Promise.resolve(null)
  ]);

  const hrefFor = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = {
      view,
      q,
      category,
      status,
      sort,
      near,
      radiusKm: near ? String(radiusKm) : ""
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v) p.set(k, v as string);
    if (p.get("view") === "list") p.delete("view");
    if (p.get("sort") === "activity") p.delete("sort");
    const s = p.toString();
    return `/issues${s ? `?${s}` : ""}`;
  };

  const activeChips: Array<{ label: string; href: string }> = [];
  if (q) activeChips.push({ label: `“${q}”`, href: hrefFor({ q: null, page: null }) });
  if (category)
    activeChips.push({
      label: categories.items.find((c) => c.slug === category)?.name ?? category,
      href: hrefFor({ category: null, page: null })
    });
  if (status)
    activeChips.push({
      label: STATUS_INFO[status as keyof typeof STATUS_INFO]?.label ?? status,
      href: hrefFor({ status: null, page: null })
    });
  if (near)
    activeChips.push({
      label: `Within ${radiusKm} km of you`,
      href: hrefFor({ near: null, radiusKm: null, page: null })
    });

  const tab = "inline-flex min-h-11 items-center gap-2 border-2 px-4 font-semibold";

  return (
    <div className="wrap pb-10 pt-12">
      <header className="max-w-3xl">
        <p className="eyebrow">Public record</p>
        <h1 className="display-lg mt-2">Explore community issues</h1>
        <p className="mt-4 text-lg text-ink-soft">
          Every report here was filed by a resident and is open to anyone. Statuses say who
          confirmed what, so a label like “Submitted” never implies an official response.
        </p>
      </header>

      <form
        key={`${view}|${q}|${category}|${status}|${sort}|${near}`}
        method="get"
        action="/issues"
        role="search"
        aria-label="Search and filter reports"
        className="mt-10 border-y-2 border-ink py-6"
      >
        <input
          type="hidden"
          name="view"
          value={view === "map" ? "map" : ""}
          disabled={view !== "map"}
        />
        {near && <input type="hidden" name="near" value={near} />}
        {near && <input type="hidden" name="radiusKm" value={String(radiusKm)} />}
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
          <div>
            <label htmlFor="q" className="mb-1.5 block font-semibold">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Street, landmark, keyword or SW-reference"
              className="block w-full rounded-[2px] border-2 border-ink/70 bg-surface px-3.5 py-3 hover:border-ink"
            />
          </div>
          <FilterSelect
            id="category"
            label="Category"
            value={category}
            options={[
              { value: "", label: "All categories" },
              ...categories.items.map((c) => ({ value: c.slug, label: c.name }))
            ]}
          />
          <FilterSelect
            id="status"
            label="Status"
            value={status}
            options={[
              { value: "", label: "Any status" },
              ...REPORT_STATUSES.map((s) => ({ value: s, label: STATUS_INFO[s].label }))
            ]}
          />
          <FilterSelect id="sort" label="Sort by" value={sort} options={SORTS} />
          <Button type="submit" size="md" className="w-full md:w-auto">
            Apply
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <NearMeButton active={Boolean(near)} />
          {activeChips.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {activeChips.map((c) => (
                <li key={c.label}>
                  <Link
                    href={c.href}
                    className="inline-flex items-center gap-2 border border-ink bg-surface px-3 py-1.5 text-[0.875rem] font-semibold hover:bg-ink hover:text-paper"
                  >
                    {c.label}
                    <X className="size-3.5" aria-hidden />
                    <span className="sr-only">Remove filter</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={view === "map" ? "/issues?view=map" : "/issues"}
                  className="px-2 text-[0.875rem] underline"
                >
                  Clear all
                </Link>
              </li>
            </ul>
          )}
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted" aria-live="polite">
          {results
            ? results.total === 0
              ? "No reports found"
              : `${formatNumber(results.total)} ${results.total === 1 ? "report" : "reports"}${results.totalPages > 1 ? ` · page ${results.page} of ${results.totalPages}` : ""}`
            : "Showing reports on the map"}
        </p>
        <nav aria-label="Switch between list and map" className="flex">
          <Link
            href={hrefFor({ view: "list", page: null })}
            aria-current={view === "list" ? "page" : undefined}
            className={`${tab} ${view === "list" ? "border-ink bg-ink text-paper" : "border-ink hover:bg-paper-deep"}`}
          >
            <List className="size-4" aria-hidden /> List
          </Link>
          <Link
            href={hrefFor({ view: "map", page: null })}
            aria-current={view === "map" ? "page" : undefined}
            className={`${tab} -ml-0.5 ${view === "map" ? "border-ink bg-ink text-paper" : "border-ink hover:bg-paper-deep"}`}
          >
            <MapIcon className="size-4" aria-hidden /> Map
          </Link>
        </nav>
      </div>

      <div className="mt-6">
        {view === "map" ? (
          <ReportsMap filterQuery={filters.toString().replace(/&?(near|radiusKm)=[^&]*/g, "")} />
        ) : results && results.items.length > 0 ? (
          <>
            <div>
              {results.items.map((r) => (
                <div key={r.id} className="relative">
                  <ReportRow report={r} showDistance={Boolean(near)} />
                </div>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Pagination
                page={results.page}
                totalPages={results.totalPages}
                hrefFor={(p) => hrefFor({ page: String(p) })}
              />
            </div>
          </>
        ) : (
          <EmptyState
            title={
              activeChips.length > 0
                ? "No reports match those filters."
                : "No reports have been filed yet."
            }
            action={
              <>
                {activeChips.length > 0 && (
                  <ButtonLink href="/issues" variant="secondary">
                    Clear filters
                  </ButtonLink>
                )}
                <ButtonLink href="/report">Report an issue</ButtonLink>
              </>
            }
          >
            {activeChips.length > 0
              ? "Try a broader search, remove a filter, or check the map view for nearby reports."
              : "When residents file reports they appear here straight away. Be the first."}
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value}
        className="block w-full appearance-none rounded-[2px] border-2 border-ink/70 bg-surface bg-[length:1rem] bg-[right_0.9rem_center] bg-no-repeat px-3.5 py-3 pr-10 hover:border-ink"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2314201a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
