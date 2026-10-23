import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  STATUS_INFO,
  VERIFICATION_INFO,
  type CommentDto,
  type Paginated,
  type ReportDetailDto
} from "@sidewalk/contracts";
import { CommentSection } from "@/components/report/comments";
import { EvidenceGallery } from "@/components/report/evidence-gallery";
import { FlagDialog } from "@/components/report/flag-dialog";
import { FollowButton } from "@/components/report/follow-button";
import { LocationMap } from "@/components/report/location-map";
import { OwnerPanel } from "@/components/report/owner-panel";
import { ShareButton } from "@/components/report/share-button";
import { StaffPanel } from "@/components/report/staff-panel";
import { Timeline } from "@/components/report/timeline";
import { Alert } from "@/components/ui/alert";
import { StatusBadge, VerificationBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";
import { getSession, serverFetch } from "@/lib/server-api";

type Params = { reference: string };

async function load(reference: string) {
  if (!/^SW-[0-9A-HJKMNP-TVWXYZ]{6}$/i.test(reference)) notFound();
  const [report, comments] = await Promise.all([
    serverFetch<ReportDetailDto>(`/reports/${reference.toUpperCase()}`),
    serverFetch<Paginated<CommentDto>>(`/reports/${reference.toUpperCase()}/comments?pageSize=50`)
  ]);
  return { report, comments };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { reference } = await params;
  try {
    const { report } = await load(reference);
    return {
      title: `${report.title} (${report.reference})`,
      description: `${STATUS_INFO[report.status].label}. ${report.excerpt}`,
      openGraph: { title: report.title, description: report.excerpt, type: "article" },
      robots:
        report.moderationState && report.moderationState !== "VISIBLE"
          ? { index: false }
          : undefined
    };
  } catch {
    return { title: "Report not found" };
  }
}

export default async function ReportPage({ params }: { params: Promise<Params> }) {
  const { reference } = await params;
  const [{ report, comments }, user] = await Promise.all([load(reference), getSession()]);
  const hidden = report.moderationState && report.moderationState !== "VISIBLE";
  const resolutionShown = report.status === "RESOLVED" || report.resolutionEvidence.length > 0;

  return (
    <article className="wrap pb-6 pt-8">
      <nav aria-label="Breadcrumb" className="text-[0.875rem] text-muted">
        <Link
          href="/issues"
          className="underline decoration-rule underline-offset-2 hover:decoration-ink"
        >
          Explore issues
        </Link>
        <span aria-hidden> / </span>
        <Link
          href={`/issues?category=${report.category.slug}`}
          className="underline decoration-rule underline-offset-2 hover:decoration-ink"
        >
          {report.category.name}
        </Link>
      </nav>

      <header className="mt-6 grid gap-6 border-b-2 border-ink pb-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <div>
          <p className="eyebrow font-mono !tracking-[0.08em]">{report.reference}</p>
          <h1 className="display-lg mt-3 max-w-4xl">{report.title}</h1>
          <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
            <span>{report.category.name}</span>
            {report.areaName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {report.areaName}
              </span>
            )}
            <span>
              Reported <time dateTime={report.createdAt}>{formatDate(report.createdAt)}</time>
            </span>
            <span>
              Last activity{" "}
              <time dateTime={report.lastActivityAt}>{formatDate(report.lastActivityAt)}</time>
            </span>
          </p>
        </div>
        <div className="self-end border-l-4 border-ink bg-paper-deep p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <VerificationBadge verification={report.verification} />
          </div>
          <p className="mt-3 text-[0.925rem] leading-snug">{STATUS_INFO[report.status].meaning}</p>
        </div>
      </header>

      {hidden && (
        <Alert
          tone="warn"
          title={
            report.moderationState === "HIDDEN"
              ? "This report is hidden from the public"
              : "This report was removed"
          }
          className="mt-8"
        >
          {report.moderationNotice ? (
            <>
              Reason recorded by moderators (
              {report.moderationNotice.policy.replace("_", " ").toLowerCase()}): “
              {report.moderationNotice.reason}”. Only you and Sidewalk staff can see this page.
            </>
          ) : (
            "Only you and Sidewalk staff can see this page."
          )}
        </Alert>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <div className="min-w-0 space-y-14">
          <section aria-labelledby="what">
            <h2 id="what" className="eyebrow">
              What was reported
            </h2>
            <div className="prose-sidewalk mt-4 text-[1.125rem]">
              {report.description.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
            <p className="mt-5 max-w-xl text-[0.875rem] text-muted">
              {report.reporterName
                ? `Reported by ${report.reporterName}.`
                : "Reported by a resident who chose not to show their name."}{" "}
              This is a resident’s account, not an official statement.
            </p>
          </section>

          {report.evidence.length > 0 && (
            <section aria-labelledby="photos">
              <h2 id="photos" className="eyebrow">
                Photographs from the reporter
              </h2>
              <div className="mt-4">
                <EvidenceGallery items={report.evidence} label="Reporter photograph" />
              </div>
            </section>
          )}

          {resolutionShown && (
            <section
              aria-labelledby="resolution"
              className="border-l-4 border-kerb bg-kerb-wash/60 p-6"
            >
              <h2 id="resolution" className="eyebrow !text-kerb">
                Resolution
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VerificationBadge verification={report.verification} />
              </div>
              <p className="mt-3 max-w-xl text-[0.95rem]">
                {VERIFICATION_INFO[report.verification].meaning}
              </p>
              {report.resolutionNote && (
                <blockquote className="mt-4 max-w-xl border-l-4 border-kerb/50 pl-4 text-[1.05rem] leading-relaxed">
                  {report.resolutionNote}
                  {report.resolvedAt && (
                    <footer className="mt-1 text-[0.8125rem] text-muted">
                      Recorded {formatDate(report.resolvedAt)}
                    </footer>
                  )}
                </blockquote>
              )}
              {report.resolutionEvidence.length > 0 ? (
                <div className="mt-5">
                  <p className="mb-2 text-[0.9rem] font-semibold">Evidence of the fix</p>
                  <EvidenceGallery
                    items={report.resolutionEvidence}
                    label="Resolution photograph"
                  />
                </div>
              ) : (
                <p className="mt-4 text-[0.9rem] font-semibold">
                  No photographs of the fix have been provided.
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="history">
            <h2 id="history" className="display-md">
              What has happened
            </h2>
            <p className="mb-6 mt-2 max-w-xl text-muted">
              Each entry is added, never rewritten. Status changes show who stated them and whether
              they were checked.
            </p>
            <Timeline events={report.timeline} />
          </section>

          <section aria-labelledby="discussion">
            <h2 id="discussion" className="display-md">
              Discussion
            </h2>
            <p className="mb-6 mt-2 max-w-xl text-muted">
              Comments are from residents unless marked “Sidewalk staff”. Neither is an official
              government response.
            </p>
            <CommentSection
              reference={report.reference}
              initial={comments.items}
              signedIn={Boolean(user)}
              canComment={report.viewer.canComment}
              isStaff={report.viewer.isStaff}
            />
          </section>
        </div>

        <aside className="space-y-8" aria-label="Details and actions">
          {report.viewer.isOwner && <OwnerPanel report={report} />}
          {report.viewer.isStaff && <StaffPanel report={report} isAdmin={user?.role === "ADMIN"} />}

          <section aria-labelledby="where" className="space-y-3">
            <h2 id="where" className="eyebrow">
              Location
            </h2>
            <LocationMap
              latitude={report.latitude}
              longitude={report.longitude}
              title={report.title}
            />
            <p className="text-[0.95rem]">{report.addressText ?? "No street address was given."}</p>
            <p className="font-mono text-[0.8125rem] text-muted">
              {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
            </p>
            <a
              href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=17/${report.latitude}/${report.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[0.9rem] underline decoration-rule underline-offset-2 hover:decoration-ink"
            >
              Open in OpenStreetMap
            </a>
          </section>

          <section aria-labelledby="facts" className="border-t-2 border-ink pt-4">
            <h2 id="facts" className="eyebrow">
              Report details
            </h2>
            <dl className="mt-3 space-y-3 text-[0.925rem]">
              <div>
                <dt className="text-muted">Reference</dt>
                <dd className="font-mono font-semibold">{report.reference}</dd>
              </div>
              <div>
                <dt className="text-muted">Category</dt>
                <dd>{report.category.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Filed</dt>
                <dd>{formatDate(report.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Last updated</dt>
                <dd>{formatDate(report.updatedAt)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-col items-start gap-3">
              <ShareButton path={`/issues/${report.reference}`} />
              {report.moderationState === undefined || report.moderationState === "VISIBLE" ? (
                <FollowButton
                  reference={report.reference}
                  following={report.viewer.following}
                  isOwner={report.viewer.isOwner}
                  signedIn={Boolean(user)}
                  verified={Boolean(user?.emailVerified)}
                />
              ) : null}
              {!report.viewer.isOwner && (
                <FlagDialog
                  endpoint={`/reports/${report.reference}/flags`}
                  subject="report"
                  signedIn={Boolean(user)}
                  alreadyFlagged={report.viewer.hasFlagged}
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}
