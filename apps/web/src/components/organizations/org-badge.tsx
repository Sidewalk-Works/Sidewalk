import clsx from "clsx";
import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import Link from "next/link";
import { ORG_VERIFICATION_INFO, type OrganizationBadgeDto } from "@sidewalk/contracts";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[0.8125rem] font-bold leading-none";

/**
 * What Sidewalk knows about an organization's identity, always as words. "Verified" means staff reviewed evidence of
 * identity: it says nothing about whether the organization's statements are true. A suspended organization is shown as
 * suspended first, so it never reads as simply "verified".
 */
export function OrganizationBadge({
  org,
  className
}: {
  org: Pick<OrganizationBadgeDto, "verificationStatus" | "suspended">;
  className?: string;
}) {
  const label = ORG_VERIFICATION_INFO[org.verificationStatus].label;
  return (
    <span className={clsx("inline-flex flex-wrap items-center gap-2", className)}>
      {org.suspended && (
        <span className={clsx(CHIP, "border-danger bg-danger-wash text-danger")}>
          <ShieldOff className="size-3.5" aria-hidden /> Suspended
        </span>
      )}
      {org.verificationStatus === "VERIFIED" ? (
        <span className={clsx(CHIP, "border-kerb bg-kerb text-white")}>
          <ShieldCheck className="size-3.5" aria-hidden /> {label}
        </span>
      ) : org.verificationStatus === "REVOKED" ? (
        <span className={clsx(CHIP, "border-signal/40 bg-signal-wash text-signal")}>
          <ShieldAlert className="size-3.5" aria-hidden /> {label}
        </span>
      ) : (
        <span className={clsx(CHIP, "border-ink/40 bg-paper-deep text-ink-soft")}>{label}</span>
      )}
    </span>
  );
}

/** The organization's name as a link to its profile, followed by its badge. */
export function OrganizationLabel({
  org,
  className
}: {
  org: OrganizationBadgeDto;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5", className)}>
      <Link
        href={`/organizations/${org.slug}`}
        className="font-semibold underline decoration-laterite decoration-2 underline-offset-4"
      >
        {org.name}
      </Link>
      <OrganizationBadge org={org} />
    </span>
  );
}
