import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type {
  CategoryDto,
  Paginated,
  PlatformStatsDto,
  ReportSummaryDto
} from "@sidewalk/contracts";
import { Stat } from "@/components/home/stat";
import { ReportRow } from "@/components/report/report-row";
import { ButtonLink } from "@/components/ui/button";
import { Photo } from "@/components/ui/photo";
import { StatusBadge, VerificationBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { photos } from "@/lib/photos";
import { serverFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const steps = [
  {
    n: "01",
    title: "Report",
    body: "Pin the spot on a map, describe what is wrong and attach photographs. It takes about three minutes and works on a phone."
  },
  {
    n: "02",
    title: "Review",
    body: "Your report goes public as “Submitted”. That label means a resident filed it. It does not mean anyone official has acknowledged it."
  },
  {
    n: "03",
    title: "Follow",
    body: "Every change of status, with who recorded it and why, is added to a timeline that nobody can quietly rewrite."
  },
  {
    n: "04",
    title: "Verify",
    body: "A resolution is only a claim until someone checks the evidence. Sidewalk shows which is which, every time."
  }
];

export default async function HomePage() {
  const [stats, recent, categories] = await Promise.all([
    serverFetch<PlatformStatsDto>("/reports/stats"),
    serverFetch<Paginated<ReportSummaryDto>>("/reports?pageSize=5&sort=newest"),
    serverFetch<{ items: CategoryDto[] }>("/categories")
  ]);
  const [lead, ...rest] = recent.items;
  const hasReports = stats.totalReports > 0;

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="border-b border-rule">
        <div className="wrap grid gap-10 pb-14 pt-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="flex flex-col justify-between">
            <div>
              <p className="eyebrow">Civic reporting for Nigerian communities</p>
              <h1 className="display-xl mt-5">
                Report it.
                <br />
                Track it.
                <br />
                <span className="italic text-laterite">See it fixed.</span>
              </h1>
            </div>
            <div className="mt-10 max-w-xl">
              <p className="text-[1.2rem] leading-relaxed text-ink-soft">
                Sidewalk is where residents report potholes, floods, uncollected refuse and dead
                streetlights, and where every update, claim and piece of evidence stays on the
                public record.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink
                  href="/report"
                  size="lg"
                  icon={<ArrowRight className="size-5" aria-hidden />}
                >
                  Report an issue
                </ButtonLink>
                <ButtonLink href="/issues" size="lg" variant="secondary">
                  Explore community issues
                </ButtonLink>
              </div>
            </div>
          </div>
          <Photo
            photo={photos["flooded-street-lagos"]!}
            priority
            sizes="(min-width: 1024px) 38vw, 100vw"
            imgClassName="aspect-[4/5] lg:aspect-[3/4]"
          />
        </div>
      </section>

      {/* ───────── Real numbers ───────── */}
      <section aria-labelledby="numbers" className="wrap pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="numbers" className="display-md max-w-xl">
            {hasReports ? "What has been reported so far" : "Nothing has been reported yet"}
          </h2>
          <p className="max-w-sm text-[0.875rem] text-muted">
            Counted directly from public reports on this site, as of {formatDate(stats.generatedAt)}
            . Nothing is estimated or rounded up.
          </p>
        </div>
        {hasReports ? (
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            <Stat
              value={stats.totalReports}
              label="Reports filed"
              note={`${stats.reportsWithEvidence} include photographs`}
            />
            <Stat value={stats.openReports} label="Still open" note="Not yet resolved or closed" />
            <Stat
              value={stats.resolvedReports}
              label="Marked resolved"
              note="A claim, until verified"
            />
            <Stat
              value={stats.verifiedResolutions}
              label="Resolutions verified"
              note="Checked against evidence"
            />
          </div>
        ) : (
          <p className="mt-6 max-w-2xl text-lg text-muted">
            This is a brand-new community record, so the counters are honestly at zero. The first
            report sets the standard for the rest.{" "}
            <Link href="/report" className="link font-semibold">
              File the first one
            </Link>
            .
          </p>
        )}
      </section>

      {/* ───────── Recent reports ───────── */}
      <section aria-labelledby="recent" className="wrap pt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Latest from the community</p>
            <h2 id="recent" className="display-lg mt-2">
              Recent reports
            </h2>
          </div>
          <Link href="/issues" className="inline-flex items-center gap-2 font-semibold link">
            See every report <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {lead ? (
          <div className="mt-10">
            <article
              className={`relative grid gap-6 border-t-2 border-ink pt-6 lg:gap-12 ${lead.coverThumbUrl ? "lg:grid-cols-[1.1fr_1fr]" : "lg:grid-cols-[1.3fr_1fr]"}`}
            >
              {lead.coverThumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lead.coverThumbUrl}
                  alt=""
                  className="aspect-[4/3] w-full object-cover lg:order-2"
                />
              )}
              <div className="flex flex-col justify-center lg:order-1">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={lead.status} />
                  <span className="eyebrow">{lead.category.name}</span>
                  <span className="eyebrow font-mono !tracking-normal normal-case">
                    {lead.reference}
                  </span>
                </div>
                <h3 className={lead.coverThumbUrl ? "display-md mt-4" : "display-lg mt-4"}>
                  <Link
                    href={`/issues/${lead.reference}`}
                    className="after:absolute after:inset-0 hover:underline decoration-laterite decoration-2 underline-offset-4"
                  >
                    {lead.title}
                  </Link>
                </h3>
              </div>
              <div
                className={`flex flex-col justify-end lg:order-3 ${lead.coverThumbUrl ? "lg:col-span-2" : ""}`}
              >
                <p className="max-w-xl text-ink-soft">{lead.excerpt}</p>
                <p className="mt-4 text-[0.9rem] text-muted">
                  {[lead.areaName, `Reported ${formatDate(lead.createdAt)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </article>
            {rest.length > 0 && (
              <div className="mt-10">
                {rest.map((r) => (
                  <div key={r.id} className="relative">
                    <ReportRow report={r} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-10 grid gap-8 border-y-2 border-ink py-12 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h3 className="display-md max-w-xl">
                The public record starts with whoever speaks first.
              </h3>
              <p className="mt-4 max-w-xl text-lg text-ink-soft">
                No reports have been filed on this site yet, and Sidewalk will not invent any. When
                the first one arrives it will appear here immediately, with its status, location and
                full history.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/report" icon={<ArrowRight className="size-5" aria-hidden />}>
                  Report the first issue
                </ButtonLink>
                <ButtonLink href="/how-it-works" variant="secondary">
                  How it works
                </ButtonLink>
              </div>
            </div>
            <Photo
              photo={photos["waterlogged-road"]!}
              sizes="(min-width: 1024px) 34vw, 100vw"
              imgClassName="aspect-[4/3]"
            />
          </div>
        )}
      </section>

      {/* ───────── How it works ───────── */}
      <section aria-labelledby="how" className="wrap pt-28">
        <p className="eyebrow">A report is not the same as a result</p>
        <h2 id="how" className="display-lg mt-2 max-w-3xl">
          Four steps, and an honest label at each one
        </h2>
        <ol className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="border-t-2 border-ink pt-4">
              <span className="font-display text-[3rem] leading-none text-laterite [font-variant-numeric:lining-nums]">
                {s.n}
              </span>
              <h3 className="mt-4 font-sans text-xl font-bold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────── Claim versus proof ───────── */}
      <section aria-labelledby="proof" className="mt-28 bg-ink text-paper">
        <div className="wrap grid gap-12 py-20 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <p className="eyebrow !text-paper/65">Accountability</p>
            <h2 id="proof" className="display-lg mt-3">
              “Fixed” is a claim. Proof is evidence.
            </h2>
            <p className="mt-6 max-w-lg text-[1.1rem] leading-relaxed text-paper/85">
              Anyone can say a problem has been solved. On Sidewalk a resolution has to carry an
              explanation, and it stays labelled as unverified until a staff member who did not
              record it has checked photographs of the repair.
            </p>
            <Link
              href="/accountability"
              className="mt-8 inline-flex items-center gap-2 font-semibold underline decoration-laterite decoration-2 underline-offset-[0.3em]"
            >
              How Sidewalk handles trust <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="space-y-5 text-ink">
            <div className="border-l-4 border-signal bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="RESOLVED" />
                <VerificationBadge verification="CLAIMED" />
              </div>
              <p className="mt-3 font-semibold">“Pothole filled by the ward team on Monday.”</p>
              <p className="mt-1 text-[0.9rem] text-muted">
                A statement. Nobody has checked it. Residents can still reopen the report.
              </p>
            </div>
            <div className="border-l-4 border-kerb bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="RESOLVED" />
                <VerificationBadge verification="VERIFIED" />
              </div>
              <p className="mt-3 font-semibold">
                Same words, plus photographs of the repair and a second reviewer.
              </p>
              <p className="mt-1 text-[0.9rem] text-muted">
                Only this state is called verified, and the timeline shows when and by whom (as
                “Sidewalk staff”).
              </p>
            </div>
            <p className="text-[0.8125rem] text-paper/60">
              Illustration of the two labels. These are examples of the interface, not reports.
            </p>
          </div>
        </div>
      </section>

      {/* ───────── What you can report ───────── */}
      <section
        aria-labelledby="topics"
        className="wrap grid gap-12 pt-28 lg:grid-cols-[1fr_1.2fr] lg:gap-20"
      >
        <div>
          <p className="eyebrow">What you can report</p>
          <h2 id="topics" className="display-lg mt-2">
            Anything the public is meant to be able to rely on
          </h2>
          <Photo
            photo={photos["street-life-lagos"]!}
            sizes="(min-width: 1024px) 34vw, 100vw"
            className="mt-10"
            imgClassName="aspect-[4/3]"
          />
        </div>
        <ul className="self-start border-t-2 border-ink">
          {categories.items.map((c) => (
            <li key={c.id} className="border-b border-rule">
              <Link
                href={`/issues?category=${c.slug}`}
                className="group flex items-start justify-between gap-6 py-5"
              >
                <span>
                  <span className="block font-display text-[1.5rem] leading-tight tracking-tight group-hover:underline decoration-laterite decoration-2 underline-offset-4">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-[0.95rem] text-muted">{c.description}</span>
                </span>
                <ArrowRight
                  className="mt-2 size-5 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ───────── Closing call ───────── */}
      <section className="wrap pt-28">
        <div className="border-y-2 border-ink py-14 text-center">
          <h2 className="display-lg mx-auto max-w-3xl">
            Noticed something that should not be that way?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
            Create a free account, drop a pin and say what you saw. You can follow every step from
            your own dashboard.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink
              href="/report"
              size="lg"
              icon={<ArrowRight className="size-5" aria-hidden />}
            >
              Report an issue
            </ButtonLink>
            <ButtonLink href="/issues" size="lg" variant="secondary">
              Explore community issues
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
