import type { PrismaClient } from "../generated/prisma/client";

export interface UpgradeAccounts {
  residents: { active: number; confirmed: number; unconfirmed: number };
  moderators: { active: number; confirmed: number; unconfirmed: number };
  administrators: { active: number; confirmed: number; unconfirmed: number };
  /** Active staff who cannot use staff tools until they confirm, by address (operators need to know who). */
  unconfirmedStaff: Array<{ email: string; role: string }>;
  /** Sessions that stay valid across the upgrade for people who now need to confirm. */
  liveSessionsOfUnconfirmed: number;
}

/** What the new email-confirmation rule means for the accounts that already exist. Read-only. */
export async function accountsAffected(db: PrismaClient): Promise<UpgradeAccounts> {
  const role = async (r: "CITIZEN" | "MODERATOR" | "ADMIN") => {
    const where = { role: r, status: "ACTIVE" as const };
    const [active, confirmed] = await Promise.all([
      db.user.count({ where }),
      db.user.count({ where: { ...where, emailVerifiedAt: { not: null } } })
    ]);
    return { active, confirmed, unconfirmed: active - confirmed };
  };
  const [residents, moderators, administrators, unconfirmedStaff, live] = await Promise.all([
    role("CITIZEN"),
    role("MODERATOR"),
    role("ADMIN"),
    db.user.findMany({
      where: { role: { in: ["MODERATOR", "ADMIN"] }, status: "ACTIVE", emailVerifiedAt: null },
      select: { email: true, role: true },
      orderBy: [{ role: "asc" }, { email: "asc" }]
    }),
    db.session.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE", emailVerifiedAt: null }
      }
    })
  ]);
  return {
    residents,
    moderators,
    administrators,
    unconfirmedStaff,
    liveSessionsOfUnconfirmed: live
  };
}

export interface ConfirmSelection {
  /** Exactly these addresses (any role). */
  emails?: string[];
  /** Every active moderator and administrator whose address is still unconfirmed. */
  staff?: boolean;
}

export interface ConfirmResult {
  candidates: Array<{ id: string; email: string; role: string }>;
  /** Addresses that were asked for but are not active accounts or are already confirmed. */
  skipped: string[];
  applied: number;
}

export const MIN_ATTESTATION = 12;

/**
 * Operator-attested confirmation, for accounts whose owners the operator knows out of band (the usual case:
 * the first administrators and the existing moderation team, before email is working). It is deliberately not
 * automatic and not blanket: the caller names the addresses (or says "unconfirmed staff"), must give a written
 * reason, and gets a dry run unless `apply` is set. Each change writes an audit row naming the reason. It never
 * touches residents unless their address is listed explicitly, and never touches suspended or deleted accounts.
 */
export async function confirmEmails(
  db: PrismaClient,
  selection: ConfirmSelection,
  attestation: string,
  apply: boolean
): Promise<ConfirmResult> {
  const reason = attestation.trim();
  if (reason.length < MIN_ATTESTATION)
    throw new Error(
      `A written reason of at least ${MIN_ATTESTATION} characters is required (--reason "...").`
    );
  const wanted = (selection.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0 && !selection.staff)
    throw new Error("Say whom to confirm: --email <address> (repeatable) and/or --staff.");

  const found = await db.user.findMany({
    where: {
      status: "ACTIVE",
      emailVerifiedAt: null,
      OR: [
        ...(wanted.length ? [{ email: { in: wanted } }] : []),
        ...(selection.staff
          ? [{ role: { in: ["MODERATOR", "ADMIN"] as Array<"MODERATOR" | "ADMIN"> } }]
          : [])
      ]
    },
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" }
  });
  const foundEmails = new Set(found.map((u) => u.email));
  const skipped = wanted.filter((e) => !foundEmails.has(e));
  if (!apply) return { candidates: found, skipped, applied: 0 };

  let applied = 0;
  await db.$transaction(async (tx) => {
    for (const user of found) {
      // The conditional update keeps a concurrent confirmation (the owner clicking their link) from being overwritten.
      const done = await tx.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null, status: "ACTIVE" },
        data: { emailVerifiedAt: new Date() }
      });
      if (done.count !== 1) continue;
      applied += 1;
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "user.email_confirmed",
          entityType: "User",
          entityId: user.id,
          metadata: { via: "cli", basis: "operator attestation", reason }
        }
      });
    }
  });
  return { candidates: found, skipped, applied };
}
