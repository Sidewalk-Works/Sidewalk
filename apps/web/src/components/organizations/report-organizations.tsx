import {
  RELATION_BASIS_INFO,
  RELATION_STATUS_INFO,
  type ReportOrganizationDto
} from "@sidewalk/contracts";
import { formatDate } from "@/lib/format";
import { OrganizationLabel } from "./org-badge";

/** Which organizations are connected to this report, on what basis, and what each has (not) said. Not an assignment. */
export function ReportOrganizations({ items }: { items: ReportOrganizationDto[] }) {
  return (
    <section aria-labelledby="orgs">
      <h2 id="orgs" className="display-md">
        Organizations connected to this report
      </h2>
      <p className="mb-6 mt-2 max-w-xl text-muted">
        Connected means it was suggested or added as relevant. It does not mean the organization has
        accepted responsibility.
      </p>
      {items.length === 0 ? (
        <p className="border-y border-dashed border-ink/40 py-6 text-muted">
          No organization is connected to this report yet.
        </p>
      ) : (
        <ul className="border-t-2 border-ink">
          {items.map((r) => (
            <li key={r.organization.slug} className="border-b border-rule py-4">
              <OrganizationLabel org={r.organization} />
              <p className="mt-1.5 text-[0.9rem] text-muted">
                {RELATION_BASIS_INFO[r.basis].label} · {RELATION_STATUS_INFO[r.status].label}
                {r.acknowledgedAt ? (
                  <> · acknowledged {formatDate(r.acknowledgedAt)}</>
                ) : r.status !== "OUTSIDE_REMIT" ? (
                  <> · has not acknowledged it</>
                ) : null}
                {r.outsideRemitAt && <> · said so on {formatDate(r.outsideRemitAt)}</>}
              </p>
              {r.status === "OUTSIDE_REMIT" && (
                <p className="mt-1.5 text-[0.85rem]">
                  {RELATION_STATUS_INFO.OUTSIDE_REMIT.meaning}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
