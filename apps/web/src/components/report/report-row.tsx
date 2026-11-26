import { ArrowUpRight, Camera, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { OwnerReportDto, ReportSummaryDto } from "@sidewalk/contracts";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, timeAgo } from "@/lib/format";

type Row = ReportSummaryDto & Partial<Pick<OwnerReportDto, "actionNeeded" | "moderationState">>;

/** A ruled, scannable row. The title is the link; everything else supports the decision to open it. */
export function ReportRow({
  report,
  href,
  showDistance
}: {
  report: Row;
  href?: string;
  showDistance?: boolean;
}) {
  const target = href ?? `/issues/${report.reference}`;
  return (
    <article className="group grid gap-x-6 gap-y-3 border-t border-rule py-6 first:border-t-2 first:border-ink sm:grid-cols-[1fr_auto] md:grid-cols-[7.5rem_1fr_auto]">
      {report.coverThumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.coverThumbUrl}
          alt=""
          loading="lazy"
          width={120}
          height={90}
          className="hidden aspect-[4/3] w-30 object-cover md:block"
        />
      ) : (
        <div
          className="hidden aspect-[4/3] w-30 place-items-center bg-paper-deep md:grid"
          aria-hidden
        >
          <span className="eyebrow !text-[0.65rem]">No photo</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="eyebrow flex flex-wrap gap-x-3">
          <span>{report.category.name}</span>
          <span className="font-mono !tracking-normal normal-case">{report.reference}</span>
        </p>
        <h3 className="mt-1.5 font-display text-[1.45rem] leading-[1.15] tracking-[-0.015em] sm:text-[1.6rem]">
          <Link
            href={target}
            className="decoration-laterite decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {report.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 max-w-2xl text-[0.975rem] text-ink-soft">
          {report.excerpt}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-muted">
          {(report.areaName ?? report.addressText) && (
            <span>{report.areaName ?? report.addressText}</span>
          )}
          <span title={formatDate(report.createdAt)}>Reported {formatDate(report.createdAt)}</span>
          <span>Active {timeAgo(report.lastActivityAt)}</span>
          {showDistance && report.distanceKm !== undefined && (
            <span>
              {report.distanceKm < 1
                ? `${Math.round(report.distanceKm * 1000)} m away`
                : `${report.distanceKm.toFixed(1)} km away`}
            </span>
          )}
          {report.evidenceCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden /> {report.evidenceCount}
              <span className="sr-only">photographs</span>
            </span>
          )}
          {report.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden /> {report.commentCount}
              <span className="sr-only">comments</span>
            </span>
          )}
        </p>
        {report.actionNeeded && (
          <p className="mt-3 border-l-4 border-laterite bg-laterite-wash px-3 py-2 text-[0.9rem] font-medium">
            {report.actionNeeded.message}
          </p>
        )}
      </div>
      <div className="relative flex items-start gap-3 sm:flex-col sm:items-end">
        <StatusBadge status={report.status} />
        {report.moderationState && report.moderationState !== "VISIBLE" && (
          <span className="border border-danger bg-danger-wash px-2 py-1 text-[0.75rem] font-bold uppercase tracking-wide text-danger">
            {report.moderationState === "HIDDEN" ? "Hidden" : "Removed"}
          </span>
        )}
        <ArrowUpRight
          className="hidden size-5 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </div>
    </article>
  );
}
