import { STATUS_INFO, type TimelineEventDto } from "@sidewalk/contracts";
import { formatDateTime } from "@/lib/format";

function describe(e: TimelineEventDto): { title: string; detail?: string } {
  const who = e.actorLabel;
  switch (e.type) {
    case "SUBMITTED":
      return {
        title: `${who} filed this report`,
        detail: "Filing a report is not an official acknowledgment."
      };
    case "STATUS_CHANGED": {
      const to = e.toStatus ? STATUS_INFO[e.toStatus].label : "a new status";
      const from = e.fromStatus ? STATUS_INFO[e.fromStatus].label : null;
      const basis =
        e.basis === "REPORTER_CLAIM"
          ? "Stated by the reporter, not checked"
          : "Recorded by Sidewalk staff after review";
      return {
        title: from ? `Status changed from “${from}” to “${to}”` : `Status set to “${to}”`,
        detail: basis
      };
    }
    case "EVIDENCE_ADDED":
      return { title: `${who} added a photograph` };
    case "EDITED":
      return { title: `${who} edited this report` };
    case "COMMENT_ADDED":
      return { title: `${who} posted an update`, detail: "See the discussion below." };
    case "RESOLUTION_VERIFIED":
      return {
        title: "Resolution verified",
        detail:
          "A Sidewalk staff member who did not record the resolution checked the supporting photographs."
      };
  }
}

/** The full public history, oldest first. Entries are only ever appended. */
export function Timeline({ events }: { events: TimelineEventDto[] }) {
  return (
    <ol className="relative ml-2.5 border-l-2 border-ink" aria-label="History of this report">
      {events.map((e) => {
        const d = describe(e);
        const outcome =
          e.type === "STATUS_CHANGED" &&
          (e.toStatus === "RESOLVED" ||
            e.toStatus === "REOPENED" ||
            e.toStatus === "REJECTED" ||
            e.toStatus === "DUPLICATE");
        return (
          <li key={e.id} className="relative pb-8 pl-7 last:pb-0">
            <span
              aria-hidden
              className={`absolute -left-[0.6rem] top-1.5 size-[1.05rem] border-2 border-ink ${e.type === "RESOLUTION_VERIFIED" ? "bg-kerb" : outcome ? "bg-laterite" : "bg-paper"}`}
            />
            <p className="font-semibold leading-snug">{d.title}</p>
            <p className="mt-0.5 text-[0.85rem] text-muted">
              <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
              {d.detail && <> · {d.detail}</>}
            </p>
            {e.note && (
              <blockquote className="mt-2 max-w-xl border-l-4 border-rule bg-paper-deep px-4 py-2.5 text-[0.95rem] leading-relaxed">
                {e.note}
              </blockquote>
            )}
          </li>
        );
      })}
    </ol>
  );
}
