import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  MEMBER_ROLE_INFO,
  ORGANIZATION_LIMITS,
  TOKEN_TTL,
  type MemberRole
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { APP_ENV, type AppEnv } from "../config/env";
import { Prisma, type EmailOutbox, type OutboxKind } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER, EmailDeliveryError, type EmailProvider } from "./email.provider";
import { EmailLinks } from "./links";
import { outboxHealth } from "./outbox-maintenance";
import {
  KEY_UNAVAILABLE_CODE,
  OutboxKeyUnavailableError,
  OutboxPayloadIntegrityError,
  buildOutboxKeyring,
  type OutboxKeyring
} from "./outbox-crypto";
import { templates, type RenderedEmail } from "./templates";

export const MAX_ATTEMPTS = 6;
/** Delay before attempt 2, 3, 4, ... (attempt 1 is immediate). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const STALE_LOCK_MS = 5 * 60_000;
/** A message whose key is missing is checked again this often. It does not use up delivery attempts. */
export const KEY_RETRY_MS = 10 * 60_000;
const KEY_HOLD_MS = 7 * 86_400_000;
export const PAYLOAD_INTEGRITY_CODE = "payload_integrity";
/** One-time links stop working after this long, so a message carrying one is pointless to send later. */
const LINK_LIFETIME_MS: Partial<Record<OutboxKind, number>> = {
  ORGANIZATION_INVITATION: ORGANIZATION_LIMITS.invitationTtlDays * 86_400_000,
  EMAIL_VERIFICATION: TOKEN_TTL.emailVerificationHours * 3_600_000,
  PASSWORD_RESET: TOKEN_TTL.passwordResetMinutes * 60_000
};

export interface EnqueueInput {
  kind: OutboxKind;
  userId: string | null;
  toEmail: string;
  payload: Record<string, unknown>;
  /** Same key, same message: enqueueing twice (for example in a retried transaction) creates one row. */
  dedupeKey?: string;
}

/** Strips anything address-, link- or token-shaped before a failure reason is stored. */
export function sanitizeError(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[address]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .slice(0, 200);
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger("Outbox");
  private readonly keyring: OutboxKeyring;

  constructor(
    private readonly prisma: PrismaService,
    private readonly links: EmailLinks,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {
    this.keyring = buildOutboxKeyring(env);
  }

  /**
   * Adds a message to the outbox. Call it with the transaction client of the event it belongs to: the row
   * then exists exactly when that event committed, and a rollback takes it away with everything else.
   */
  async enqueue(tx: Prisma.TransactionClient, input: EnqueueInput): Promise<boolean> {
    // The row id is chosen here so the ciphertext can be bound to it (a copy on another row will not decrypt).
    const id = randomUUID();
    const result = await tx.emailOutbox.createMany({
      data: [
        {
          id,
          kind: input.kind,
          userId: input.userId,
          toEmail: input.toEmail,
          payloadCiphertext: this.keyring.encrypt(input.payload, id),
          dedupeKey: input.dedupeKey ?? null
        }
      ],
      skipDuplicates: true
    });
    return result.count === 1;
  }

  /** How many messages of a kind went to this account recently. Used to cap email-bombing. */
  recentCount(userId: string, kinds: OutboxKind[], sinceMs = 3_600_000): Promise<number> {
    return this.prisma.emailOutbox.count({
      where: { userId, kind: { in: kinds }, createdAt: { gte: new Date(Date.now() - sinceMs) } }
    });
  }

  // ───────────────────────────── delivery ─────────────────────────────

  /** Claims due messages so that two workers never take the same one, then delivers them. Returns how many were handled. */
  async deliverDue(limit = 10): Promise<number> {
    // Timestamps are stored without a zone, as UTC. `now()` is a zoned instant that Postgres would convert using the
    // session's time zone, so every comparison and write below is made in UTC explicitly. Without this, a database
    // not configured for UTC would send mail hours late (west of UTC) or ignore retry delays (east of it).
    const claimed = await this.prisma.$queryRaw<EmailOutbox[]>`
      UPDATE "EmailOutbox"
      SET "status" = 'SENDING', "lockedAt" = (now() AT TIME ZONE 'UTC'), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "EmailOutbox"
        WHERE ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC'))
           OR ("status" = 'SENDING'
               AND "lockedAt" < (now() AT TIME ZONE 'UTC') - ${STALE_LOCK_MS} * interval '1 millisecond')
        ORDER BY "nextAttemptAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    for (const row of claimed) await this.deliver(row);
    return claimed.length;
  }

  private async deliver(claimed: EmailOutbox): Promise<void> {
    // A batch is claimed at once, so a message late in it may wait while earlier ones are sent (slowly, if the mail
    // server is struggling). Before sending, confirm the claim is still ours and renew it. If another worker has
    // taken the message over in the meantime, leave it to them: this is what keeps a slow batch from sending twice.
    const claimedAt = new Date();
    const mine = await this.prisma.emailOutbox.updateMany({
      where: { id: claimed.id, status: "SENDING", lockedAt: claimed.lockedAt },
      data: { lockedAt: claimedAt }
    });
    if (mine.count === 0) return;
    const row: EmailOutbox = { ...claimed, lockedAt: claimedAt };
    try {
      const message = await this.compose(row);
      if (message === "skip") {
        await this.finish(row, {
          status: "SKIPPED",
          lastError: "no longer appropriate to send",
          payloadCiphertext: null
        });
        return;
      }
      const sent = await this.provider.send({
        to: row.toEmail,
        from: this.env.EMAIL_FROM,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: `<${row.id}@${this.links.host}>`
      });
      // Delivered means the provider accepted it: only now is the row marked SENT, and the payload erased.
      await this.finish(row, {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: sent.providerMessageId,
        lastError: null,
        payloadCiphertext: null
      });
    } catch (e) {
      await this.fail(row, e);
    }
  }

  private async fail(row: EmailOutbox, error: unknown): Promise<void> {
    if (error instanceof OutboxKeyUnavailableError) {
      // Nothing is wrong with the message or the provider: the key it needs is not loaded. Keep it, do not use
      // up an attempt, and check again later, so restoring the key delivers it. The log names the key id only.
      this.logger.error(
        `Email ${row.id} (${row.kind}) cannot be read: encryption key "${error.keyId}" is not configured`
      );
      await this.finish(row, {
        status: "FAILED",
        attempts: Math.max(0, row.attempts - 1),
        lastError: `${KEY_UNAVAILABLE_CODE}: key "${error.keyId}" is not configured`,
        nextAttemptAt: new Date(Date.now() + KEY_RETRY_MS)
      });
      return;
    }
    const permanent = error instanceof EmailDeliveryError ? error.permanent : false;
    const code = error instanceof EmailDeliveryError ? error.code : "delivery_error";
    const reason = sanitizeError(error instanceof Error ? error.message : String(error));
    if (permanent || row.attempts >= MAX_ATTEMPTS) {
      // The failure is recorded and visible to administrators. The log names the id and kind only.
      this.logger.error(
        `Email ${row.id} (${row.kind}) gave up after ${row.attempts} attempt(s): ${code}`
      );
      await this.finish(row, { status: "DEAD", lastError: sanitizeError(`${code}: ${reason}`) });
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(row.attempts - 1, RETRY_DELAYS_MS.length - 1)] as number;
    this.logger.warn(
      `Email ${row.id} (${row.kind}) failed attempt ${row.attempts}: ${code}; retrying in ${Math.round(delay / 1000)}s`
    );
    await this.finish(row, {
      status: "FAILED",
      lastError: sanitizeError(`${code}: ${reason}`),
      nextAttemptAt: new Date(Date.now() + delay)
    });
  }

  /** Only the worker that still holds the claim (same status and claim time) may finish the row. */
  private async finish(
    row: EmailOutbox,
    data: Prisma.EmailOutboxUpdateManyMutationInput
  ): Promise<void> {
    await this.prisma.emailOutbox.updateMany({
      where: { id: row.id, status: "SENDING", lockedAt: row.lockedAt },
      data: { ...data, lockedAt: null }
    });
  }

  /** Builds the message, or returns "skip" when the recipient or the situation no longer calls for it. */
  private async compose(row: EmailOutbox): Promise<RenderedEmail | "skip"> {
    let payload: Record<string, string> = {};
    if (row.payloadCiphertext) {
      try {
        payload = this.keyring.decrypt<Record<string, string>>(row.payloadCiphertext, row.id);
      } catch (e) {
        if (e instanceof OutboxKeyUnavailableError) throw e;
        // Failed authentication under a configured key: tampered with, corrupted, or the key material for this
        // id was changed. The ciphertext is kept, so an administrator can retry once the cause is fixed.
        const keyId = e instanceof OutboxPayloadIntegrityError ? e.keyId : "unknown";
        throw new EmailDeliveryError(
          PAYLOAD_INTEGRITY_CODE,
          true,
          `The stored message content failed its integrity check (key "${keyId}").`
        );
      }
    }
    const lifetime = LINK_LIFETIME_MS[row.kind];
    if (lifetime && Date.now() - row.createdAt.getTime() > lifetime) return "skip";
    const user = row.userId
      ? await this.prisma.user.findUnique({ where: { id: row.userId } })
      : null;
    if (row.userId && (!user || user.status !== "ACTIVE")) return "skip";
    const name = user?.displayName ?? "there";

    switch (row.kind) {
      case "EMAIL_VERIFICATION":
        if (user?.emailVerifiedAt) return "skip";
        return templates.emailVerification({
          name,
          url: this.links.withToken("/verify-email/confirm", payload.token as string),
          hours: TOKEN_TTL.emailVerificationHours
        });
      case "PASSWORD_RESET":
        return templates.passwordReset({
          name,
          url: this.links.withToken("/reset-password", payload.token as string),
          minutes: TOKEN_TTL.passwordResetMinutes
        });
      case "PASSWORD_CHANGED":
        return templates.passwordChanged({
          name,
          resetUrl: this.links.page("/forgot-password"),
          signInUrl: this.links.page("/login")
        });
      case "ACCOUNT_EXISTS":
        return templates.accountExists({
          name,
          signInUrl: this.links.page("/login"),
          resetUrl: this.links.page("/forgot-password")
        });
      case "ORGANIZATION_INVITATION": {
        // The invitation may have been revoked, accepted, or replaced by a resend while this waited in the queue.
        // Only the invitation's current link is ever sent.
        const token = String(payload.token ?? "");
        const invitation = await this.prisma.organizationInvitation.findUnique({
          where: { id: String(payload.invitationId ?? "") },
          select: { status: true, expiresAt: true, tokenHash: true }
        });
        if (
          !invitation ||
          invitation.status !== "PENDING" ||
          invitation.expiresAt <= new Date() ||
          invitation.tokenHash !== createHash("sha256").update(token).digest("hex")
        )
          return "skip";
        return templates.organizationInvitation({
          organizationName: String(payload.organizationName ?? "an organization"),
          inviterName: String(payload.inviterName ?? "Someone"),
          roleLabel: MEMBER_ROLE_INFO[payload.role as MemberRole]?.label ?? "Member",
          url: this.links.withToken("/organizations/invitations/accept", token),
          days: ORGANIZATION_LIMITS.invitationTtlDays
        });
      }
      case "NOTIFICATION": {
        const n = await this.prisma.notification.findUnique({
          where: { id: payload.notificationId as string }
        });
        // Never email an unconfirmed address, or someone who has since turned this kind of email off.
        if (!n || !user?.emailVerifiedAt || !wantsEmail(user, n.type)) return "skip";
        return templates.notification({
          name,
          title: n.title,
          body: n.body,
          url: this.links.page(n.url),
          preferencesUrl: this.links.page("/account#notifications")
        });
      }
    }
  }

  // ───────────────────────────── operations ─────────────────────────────

  async summary(): Promise<Record<string, number>> {
    const rows = await this.prisma.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  /**
   * What an operator needs to judge whether mail is flowing: the oldest message still waiting (a stalled worker
   * shows up as a growing age), messages held back because their key is missing, and how many queued messages
   * still depend on each key (so a key is only retired once nothing needs it).
   */
  async health() {
    return outboxHealth(this.prisma, this.keyring);
  }

  async list(status: string | undefined, page: number, pageSize: number) {
    const where: Prisma.EmailOutboxWhereInput =
      status && status !== "ALL" ? { status: status as EmailOutbox["status"] } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.emailOutbox.count({ where }),
      this.prisma.emailOutbox.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        attempts: r.attempts,
        to: maskEmail(r.toEmail),
        lastError: r.lastError,
        nextAttemptAt: r.nextAttemptAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  /**
   * Gives a dead or failed message another full set of attempts. Messages already sent cannot be re-queued.
   * Pass the transaction client to make the retry and its audit record one atomic change.
   */
  async retry(
    id: string,
    db: Pick<PrismaService, "emailOutbox"> = this.prisma
  ): Promise<{ previousStatus: string; kind: string; attempts: number; failure: string | null }> {
    const before = await db.emailOutbox.findUnique({
      where: { id },
      select: { status: true, kind: true, attempts: true, lastError: true, payloadCiphertext: true }
    });
    const result = await db.emailOutbox.updateMany({
      where: { id, status: { in: ["DEAD", "FAILED"] }, payloadCiphertext: { not: null } },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null }
    });
    if (!before || result.count === 0)
      throw AppError.conflict(
        "NOT_RETRYABLE",
        "Only failed messages that still have their content can be retried."
      );
    return {
      previousStatus: before.status,
      kind: before.kind,
      attempts: before.attempts,
      // The failure code only (for example `payload_integrity`), never the free-text reason.
      failure: before.lastError ? (before.lastError.split(":")[0] ?? null) : null
    };
  }

  /** Housekeeping: delivered mail and old tokens do not need to live forever. */
  async cleanup(): Promise<void> {
    const day = 86_400_000;
    await this.prisma.emailOutbox.deleteMany({
      where: {
        status: { in: ["SENT", "SKIPPED"] },
        createdAt: { lt: new Date(Date.now() - 30 * day) }
      }
    });
    await this.prisma.emailOutbox.deleteMany({
      where: { status: "DEAD", createdAt: { lt: new Date(Date.now() - 90 * day) } }
    });
    // Messages held for a missing key are kept for a week in case the key comes back, then marked DEAD (visible,
    // content retained, retryable) rather than being retried forever.
    await this.prisma.emailOutbox.updateMany({
      where: {
        status: "FAILED",
        lastError: { startsWith: `${KEY_UNAVAILABLE_CODE}:` },
        createdAt: { lt: new Date(Date.now() - KEY_HOLD_MS) }
      },
      data: {
        status: "DEAD",
        lastError: `${KEY_UNAVAILABLE_CODE}: held for a week; retry once the key is restored`
      }
    });
    await this.prisma.authToken.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * day) } }
    });
  }
}

export const maskEmail = (email: string): string => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

/** Which preference governs which notification type. Security email never goes through this. */
export function wantsEmail(
  user: {
    notifyEmailReportUpdates: boolean;
    notifyEmailComments: boolean;
    notifyEmailModeration: boolean;
  },
  type: string
): boolean {
  if (type === "COMMENT" || type === "STAFF_UPDATE") return user.notifyEmailComments;
  if (type === "MODERATION") return user.notifyEmailModeration;
  // Account-management news about an organization (applications, invitations, membership, verification) is not
  // optional: the people it concerns need to know. Everything else about reports follows the report-update switch.
  if (type === "ORGANIZATION") return true;
  return user.notifyEmailReportUpdates;
}
