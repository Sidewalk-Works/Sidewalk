import { Inject, Injectable } from "@nestjs/common";
import { APP_ENV, type AppEnv } from "../config/env";

/**
 * Every link in an email is built here from the configured application origin. A request's Host or
 * X-Forwarded-Host header is never consulted, so a forged header cannot turn a reset email into a phishing link.
 * One-time tokens go in the URL fragment: browsers never send it to a server, proxy or Referer header, and mail
 * scanners that fetch links do not run the page's script, so they cannot consume a single-use token.
 */
@Injectable()
export class EmailLinks {
  private readonly origin: string;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.origin = new URL(env.WEB_ORIGIN).origin;
  }

  page(path: string): string {
    return new URL(path, this.origin).toString();
  }

  withToken(path: string, token: string): string {
    return `${this.page(path)}#token=${encodeURIComponent(token)}`;
  }

  /** The domain used in Message-IDs and the like. */
  get host(): string {
    return new URL(this.origin).host;
  }
}
