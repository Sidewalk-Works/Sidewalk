export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface Content {
  subject: string;
  /** Short line shown by mail clients next to the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Text under the button, for example how long the link works. */
  afterAction?: string[];
  footer: string[];
}

const INK = "#14201a";
const PAPER = "#f7f4ec";
const LATERITE = "#8c3314"; // the darker laterite, so white text on the button keeps strong contrast
const MUTED = "#4a554f";

/**
 * One layout for every message. Tables and inline styles are used on purpose: it is what mail clients render
 * reliably. Text is at least 16px, contrast is high, the button is a real link with its address printed beneath,
 * and every message has a plain-text twin.
 */
function layout(c: Content): RenderedEmail {
  const paragraphs = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:17px;line-height:1.55;color:${INK};">${escapeHtml(p)}</p>`
    )
    .join("");
  const action = c.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px;"><tr><td bgcolor="${LATERITE}" style="background:${LATERITE};border-radius:2px;"><a href="${escapeHtml(c.action.url)}" style="display:inline-block;padding:14px 26px;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(c.action.label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED};">Button not working? Copy this address into your browser:<br><span style="word-break:break-all;color:${INK};">${escapeHtml(c.action.url)}</span></p>`
    : "";
  const after = (c.afterAction ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${MUTED};">${escapeHtml(p)}</p>`
    )
    .join("");
  const footer = c.footer
    .map(
      (p) =>
        `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(p)}</p>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAPER};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf8;border-top:4px solid ${INK};">
<tr><td style="padding:24px 28px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:-0.5px;color:${INK};">Sidewalk<span style="color:${LATERITE};">_</span></td></tr>
<tr><td style="padding:20px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:normal;color:${INK};">${escapeHtml(c.heading)}</h1>
${paragraphs}${action}${after}
</td></tr>
<tr><td style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #d8d0bf;">${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "SIDEWALK",
    "",
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.action ? [`${c.action.label}:`, c.action.url, ""] : []),
    ...(c.afterAction ?? []).flatMap((p) => [p, ""]),
    "--",
    ...c.footer
  ].join("\n");

  return { subject: c.subject, html, text };
}

const SECURITY_FOOTER = [
  "Sidewalk is an independent platform for community reports. It is not a government service.",
  "This is a security message about your account, so it is sent regardless of your notification settings."
];

export const templates = {
  emailVerification(d: { name: string; url: string; hours: number }): RenderedEmail {
    return layout({
      subject: "Confirm your email address for Sidewalk",
      preheader: "One step left: confirm this address so you can file reports.",
      heading: "Confirm your email address",
      paragraphs: [
        `Hello ${d.name},`,
        "Please confirm that this is your email address. Until you do, you can read reports but cannot file or comment on them."
      ],
      action: { label: "Confirm my email address", url: d.url },
      afterAction: [
        `The link works once and expires in ${d.hours} hours.`,
        "If you did not create a Sidewalk account, you can ignore this message. Nothing will happen."
      ],
      footer: SECURITY_FOOTER
    });
  },

  accountExists(d: { name: string; signInUrl: string; resetUrl: string }): RenderedEmail {
    return layout({
      subject: "Someone tried to create a Sidewalk account with your email",
      preheader: "You already have an account. Here is how to get into it.",
      heading: "You already have a Sidewalk account",
      paragraphs: [
        `Hello ${d.name},`,
        "Someone entered this email address while creating a new Sidewalk account. Because you already have one, no second account was made and nothing about yours has changed.",
        "If it was you, sign in with your existing password, or choose a new one if you have forgotten it."
      ],
      action: { label: "Sign in", url: d.signInUrl },
      afterAction: [
        `Forgotten your password? Reset it here: ${d.resetUrl}`,
        "If it was not you, you can ignore this message."
      ],
      footer: SECURITY_FOOTER
    });
  },

  passwordReset(d: { name: string; url: string; minutes: number }): RenderedEmail {
    return layout({
      subject: "Reset your Sidewalk password",
      preheader: `This link works once and expires in ${d.minutes} minutes.`,
      heading: "Choose a new password",
      paragraphs: [
        `Hello ${d.name},`,
        "We received a request to reset the password for your Sidewalk account. Use the button below to choose a new one."
      ],
      action: { label: "Choose a new password", url: d.url },
      afterAction: [
        `The link works once and expires in ${d.minutes} minutes.`,
        "If you did not ask for this, ignore this message. Your password will not change, and no one can use this link without access to this inbox."
      ],
      footer: SECURITY_FOOTER
    });
  },

  passwordChanged(d: { name: string; resetUrl: string; signInUrl: string }): RenderedEmail {
    return layout({
      subject: "Your Sidewalk password was changed",
      preheader: "Every device was signed out. If this was not you, act now.",
      heading: "Your password was changed",
      paragraphs: [
        `Hello ${d.name},`,
        "The password for your Sidewalk account was just changed, and every device was signed out. We never include your password in email.",
        "If you made this change, there is nothing more to do. If you did not, reset your password straight away, because someone else may have access to your email."
      ],
      action: { label: "Reset my password", url: d.resetUrl },
      afterAction: [`To sign in again: ${d.signInUrl}`],
      footer: SECURITY_FOOTER
    });
  },

  organizationInvitation(d: {
    organizationName: string;
    inviterName: string;
    roleLabel: string;
    url: string;
    days: number;
  }): RenderedEmail {
    return layout({
      subject: `You have been invited to join ${d.organizationName} on Sidewalk`,
      preheader: `${d.inviterName} invited you. The link works once and expires in ${d.days} days.`,
      heading: `Join ${d.organizationName} on Sidewalk`,
      paragraphs: [
        `${d.inviterName} invited this email address to join ${d.organizationName} on Sidewalk as: ${d.roleLabel}.`,
        "To accept, sign in to Sidewalk with this email address (or create an account with it and confirm it) and use the button below. An invitation does not verify the organization and does not give you any Sidewalk staff powers.",
        "If you do not recognise this invitation, ignore this message. Nothing happens unless you accept."
      ],
      action: { label: "Review the invitation", url: d.url },
      afterAction: [
        `The link works once and expires in ${d.days} days.`,
        "It only works for the account that uses this email address."
      ],
      footer: SECURITY_FOOTER
    });
  },

  notification(d: {
    name: string;
    title: string;
    body: string;
    url: string;
    preferencesUrl: string;
  }): RenderedEmail {
    return layout({
      subject: d.title,
      preheader: d.body,
      heading: d.title,
      paragraphs: [`Hello ${d.name},`, d.body],
      action: { label: "See the update", url: d.url },
      footer: [
        "Sidewalk is an independent platform for community reports. It is not a government service.",
        `You get this because you filed or follow this report. Change which updates reach your inbox: ${d.preferencesUrl}`
      ]
    });
  }
};
