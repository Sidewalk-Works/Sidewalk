import { expect } from "@playwright/test";

/** The Mailpit sink from docker-compose: every message the app sends in development and tests lands here. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

export interface Mail {
  id: string;
  subject: string;
  text: string;
  html: string;
  to: string;
}

async function search(to: string): Promise<Array<{ ID: string; Subject: string }>> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}. Is docker compose up?`);
  return ((await res.json()) as { messages: Array<{ ID: string; Subject: string }> }).messages;
}

async function load(id: string, to: string): Promise<Mail> {
  const m = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Subject: string;
    Text: string;
    HTML: string;
  };
  return { id, subject: m.Subject, text: m.Text, html: m.HTML, to };
}

/** Waits (the app delivers in the background) for a message to an address, optionally matching the subject. */
export async function waitForMail(to: string, subject?: RegExp, timeoutMs = 15_000): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      async () => {
        for (const m of await search(to)) {
          if (!subject || subject.test(m.Subject)) {
            found = await load(m.ID, to);
            return true;
          }
        }
        return false;
      },
      { timeout: timeoutMs, message: `no email to ${to} matching ${subject ?? "anything"}` }
    )
    .toBe(true);
  return found as Mail;
}

/** Proves that nothing is sent: waits a while, then checks the mailbox is still empty. */
export async function expectNoMail(to: string, subject?: RegExp, waitMs = 2500): Promise<void> {
  await new Promise((r) => setTimeout(r, waitMs));
  const matching = (await search(to)).filter((m) => !subject || subject.test(m.Subject));
  expect(matching, `unexpected email to ${to}`).toHaveLength(0);
}

export function linkIn(mail: Mail): string {
  const match = mail.text.match(/https?:\/\/\S+#token=[A-Za-z0-9_-]+/);
  if (!match) throw new Error("no one-time link in the email");
  return match[0];
}

export const tokenIn = (mail: Mail): string => linkIn(mail).split("#token=")[1] as string;
export const pathOf = (url: string): string => new URL(url).pathname + new URL(url).hash;

/** Every http(s) address in the plain-text body, without trailing punctuation. */
export const urlsIn = (mail: Mail): string[] =>
  (mail.text.match(/https?:\/\/[^\s<>"]+/g) ?? []).map((u) => u.replace(/[).,]+$/, ""));
