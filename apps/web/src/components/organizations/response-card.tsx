import { ArrowDownUp } from "lucide-react";
import {
  RESPONSE_TYPE_INFO,
  STATUS_INFO,
  type OfficialResponseDto,
  type ResponseType
} from "@sidewalk/contracts";
import { EvidenceGallery } from "@/components/report/evidence-gallery";
import { FlagDialog } from "@/components/report/flag-dialog";
import { formatDateTime } from "@/lib/format";
import { OrganizationLabel } from "./org-badge";

const CAVEAT: Partial<Record<ResponseType, string>> = {
  ACKNOWLEDGEMENT: "An acknowledgement is not an acceptance of responsibility or a promise to act.",
  OUT_OF_REMIT: "This is the organization’s statement. Sidewalk has not checked it.",
  RESOLUTION_CLAIM:
    "This is the organization’s claim that the issue is fixed. It is not independently verified."
};

/**
 * One official statement. It always says who made it (organization and the person who published it), what kind of
 * statement it is, and what it does not mean. Replaced statements stay visible and point at what replaced them.
 */
export function ResponseCard({
  response,
  canFlag,
  signedIn,
  showReport
}: {
  response: OfficialResponseDto;
  /** Offer "Flag this statement": not for members of the organization that made it. */
  canFlag?: boolean;
  signedIn?: boolean;
  showReport?: boolean;
}) {
  const info = RESPONSE_TYPE_INFO[response.type];
  const replaced = Boolean(response.supersededById);
  const hidden = response.moderationState && response.moderationState !== "VISIBLE";
  return (
    <article
      id={`response-${response.id}`}
      aria-label={`${info.label} from ${response.organization.name}`}
      className={`border-2 bg-surface p-5 ${replaced ? "border-rule" : "border-ink"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="eyebrow">Official response · {info.label}</p>
          <p className="mt-2">
            <OrganizationLabel org={response.organization} />
          </p>
        </div>
        <p className="text-[0.85rem] text-muted">
          <time dateTime={response.createdAt}>{formatDateTime(response.createdAt)}</time>
        </p>
      </header>

      {hidden && (
        <p className="mt-3 border-l-4 border-signal bg-signal-wash px-3 py-2 text-[0.9rem] font-semibold">
          {response.moderationState === "HIDDEN" ? "Hidden from the public" : "Removed"} by Sidewalk
          moderators. Only the organization and staff can see this.
        </p>
      )}
      {replaced && (
        <p className="mt-3 text-[0.9rem] font-semibold text-signal">
          Replaced by a later statement.{" "}
          <a href={`#response-${response.supersededById}`} className="underline underline-offset-2">
            See the newer statement
          </a>
        </p>
      )}
      {response.supersedesId && (
        <p className="mt-3 text-[0.9rem] font-semibold">
          This {response.type === "WITHDRAWAL" ? "withdraws" : "corrects"}{" "}
          <a href={`#response-${response.supersedesId}`} className="underline underline-offset-2">
            an earlier statement
          </a>
          . The earlier text stays on the record.
        </p>
      )}

      <p
        className={`mt-4 whitespace-pre-line text-[1.05rem] leading-relaxed ${replaced ? "text-ink-soft" : ""}`}
      >
        {response.body}
      </p>

      {response.statusChange && (
        <p className="mt-3 inline-flex items-center gap-2 text-[0.9rem] font-semibold">
          <ArrowDownUp className="size-4" aria-hidden />
          Status recorded as “{STATUS_INFO[response.statusChange.to].label}” on the organization’s
          statement
        </p>
      )}

      {response.evidence.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[0.9rem] font-semibold">
            Photographs supplied by the organization
          </p>
          <EvidenceGallery items={response.evidence} label="Organization photograph" />
        </div>
      )}

      {CAVEAT[response.type] && (
        <p className="mt-4 border-l-4 border-ink/40 bg-paper-deep px-3 py-2 text-[0.875rem]">
          {CAVEAT[response.type]}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[0.85rem] text-muted">
        <span>
          Published by {response.authorName} for {response.organization.name}
          {showReport && response.report && (
            <>
              {" "}
              on{" "}
              <a
                href={`/issues/${response.report.reference}`}
                className="font-semibold text-ink underline underline-offset-2"
              >
                {response.report.title}
              </a>
            </>
          )}
        </span>
        {canFlag && (
          <FlagDialog
            endpoint={`/official-responses/${response.id}/flags`}
            subject="statement"
            signedIn={Boolean(signedIn)}
            alreadyFlagged={response.hasFlagged}
            compact
          />
        )}
      </footer>
    </article>
  );
}
