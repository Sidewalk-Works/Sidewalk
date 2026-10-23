import { Inject, Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { APP_ENV, type AppEnv } from "../config/env";

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per outbox row, so a message re-sent after a crash carries the same Message-ID. */
  messageId: string;
}

export interface EmailProvider {
  /** Resolves only when the provider has ACCEPTED the message. Throws EmailDeliveryError otherwise. */
  send(message: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

/** `permanent` means retrying cannot help (for example the mailbox does not exist). */
export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly permanent: boolean,
    message: string
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

/** SMTP through nodemailer. Works with Mailpit locally and any SMTP relay or transactional service in production. */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // In production a connection that cannot upgrade to TLS is refused rather than sent in the clear.
      requireTLS: env.isProduction && !env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      // Nodemailer's own logger would print recipients and message bodies.
      logger: false,
      disableFileAccess: true,
      disableUrlAccess: true
    });
  }

  async send(message: OutgoingEmail): Promise<{ providerMessageId: string }> {
    try {
      const info = await this.transport.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" }
      });
      if ((info.rejected ?? []).length > 0) {
        throw new EmailDeliveryError(
          "recipient_rejected",
          true,
          "The recipient address was rejected."
        );
      }
      return { providerMessageId: info.messageId };
    } catch (e) {
      if (e instanceof EmailDeliveryError) throw e;
      const err = e as { responseCode?: number; code?: string };
      // 5xx replies are permanent refusals. 4xx replies and network problems are worth retrying.
      const permanent =
        typeof err.responseCode === "number" && err.responseCode >= 500 && err.responseCode < 600;
      throw new EmailDeliveryError(
        err.code ?? (permanent ? "smtp_rejected" : "smtp_unavailable"),
        permanent,
        "The mail server did not accept the message."
      );
    }
  }
}
