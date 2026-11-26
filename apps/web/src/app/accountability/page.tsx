import type { Metadata } from "next";
import Link from "next/link";
import { REPORT_STATUSES, STATUS_INFO, VERIFICATION_INFO } from "@sidewalk/contracts";
import { Block, PageShell } from "@/components/content/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "How Sidewalk handles trust" };

export default function AccountabilityPage() {
  return (
    <PageShell
      eyebrow="Accountability"
      title="Claims are not proof, and we show the difference"
      intro="A civic record is only useful if people can tell what was merely stated from what was actually checked. These are the rules Sidewalk applies, and the limits of what it can promise."
    >
      <Block id="statuses" heading="What each status means">
        <p>
          Statuses describe the stage of a report. Each one comes with a plain-language meaning on
          the report page so nobody has to guess.
        </p>
        <dl className="mt-6 divide-y divide-rule border-y-2 border-ink">
          {REPORT_STATUSES.map((s) => (
            <div key={s} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr]">
              <dt>
                <StatusBadge status={s} />
              </dt>
              <dd className="text-[0.975rem]">{STATUS_INFO[s].meaning}</dd>
            </div>
          ))}
        </dl>
      </Block>
      <Block id="who" heading="Who can change a status">
        <ul>
          <li>
            <strong>The reporter</strong> can say a problem has been fixed, or reopen a report that
            was marked fixed. Both are shown as the reporter’s own statements.
          </li>
          <li>
            <strong>Sidewalk staff</strong> (moderators and administrators) can review, acknowledge,
            record progress, resolve, reject or close as duplicate. Public entries say “Sidewalk
            staff”, never a person’s name.
          </li>
          <li>
            <strong>A verified organization’s representative</strong> can acknowledge a report, say
            work has started, or claim it is resolved, always labelled as that organization’s own
            statement. See “Organizations” below.
          </li>
          <li>
            <strong>Nobody else.</strong> Residents cannot acknowledge a report on anyone’s behalf,
            and the system refuses it.
          </li>
        </ul>
        <p>
          Staff are Sidewalk’s own reviewers. They are not government officials, and a staff update
          is not a statement from any agency.
        </p>
      </Block>
      <Block id="organizations" heading="Organizations that answer reports">
        <p>
          A public institution can have a profile on Sidewalk. Having a profile does not make it
          official. An organization is <strong>verified</strong> only after a Sidewalk administrator
          reviews evidence that it is the institution it says it is, and that the applicant may
          speak for it. Registering, being invited, or using a work email address never verifies
          anyone. Verification can be withdrawn, and an organization can be suspended, with
          immediate effect.
        </p>
        <ul>
          <li>
            Every response names the organization <em>and</em> the person who wrote it. It cannot be
            edited. A correction or withdrawal is added beside it, and the original stays visible as
            replaced.
          </li>
          <li>
            An <strong>acknowledgement</strong> means the organization has seen the report. It is
            not an acceptance of responsibility or a promise to act.
          </li>
          <li>
            “<strong>Outside our remit</strong>” is the organization’s own statement. Sidewalk has
            not checked it, and staff decide who is responsible.
          </li>
          <li>
            A <strong>resolution claim</strong> from an organization needs its own photograph and is
            shown as “claimed, not verified”. It becomes verified only when independent Sidewalk
            staff, who do not belong to that organization, check the evidence.
          </li>
          <li>
            Organization pages show plain counts only: reports connected, acknowledged, claimed
            resolved, and claims independently verified. They show no rates, rankings or response
            times, because those would need a denominator and a time window that could mislead.
          </li>
        </ul>
        <p>
          Statements can be flagged like any other content. Moderators can hide one, with a recorded
          reason, and the organization can still see it.{" "}
          <Link href="/organizations" className="link">
            Browse organizations
          </Link>
          .
        </p>
      </Block>
      <Block id="verification" heading="Claimed versus verified">
        <p>
          Marking a report <strong>Resolved</strong> always requires a written explanation, and
          always starts as:
        </p>
        <p className="border-l-4 border-signal bg-signal-wash px-4 py-3">
          <strong>{VERIFICATION_INFO.CLAIMED.label}.</strong> {VERIFICATION_INFO.CLAIMED.meaning}
        </p>
        <p>A resolution becomes verified only when all of these are true:</p>
        <ul>
          <li>at least one photograph of the repaired issue is attached to the report;</li>
          <li>a staff member checks it; and</li>
          <li>
            that staff member is <em>not</em> the person who recorded the resolution.
          </li>
        </ul>
        <p className="border-l-4 border-kerb bg-kerb-wash px-4 py-3">
          <strong>{VERIFICATION_INFO.VERIFIED.label}.</strong> {VERIFICATION_INFO.VERIFIED.meaning}
        </p>
        <p>
          If the problem returns, the report can be reopened. The earlier claim stays in the
          timeline.
        </p>
      </Block>
      <Block id="history" heading="A history that cannot be rewritten">
        <p>
          Every status change records the previous status, the new status, who made it, in what
          role, when, and the reason given. Entries are appended and never edited. Edits to a
          report’s description show on the timeline as “edited”, with the earlier wording kept
          privately for moderators.
        </p>
      </Block>
      <Block id="moderation" heading="Moderation">
        <p>
          Signed-in residents can flag a report or comment. Moderators can hide content (reversible
          by any moderator), remove it (reversible by administrators only) or restore it. Each
          decision needs a named policy and a written reason, is saved to a moderation history, and
          is written to an audit log. The author of hidden content can read the reason.
        </p>
        <p>
          Staff also keep internal notes on reports. These are stored separately and are never
          returned by any public page.
        </p>
      </Block>
      <Block id="limits" heading="What Sidewalk does not claim">
        <ul>
          <li>
            No government agency has endorsed Sidewalk. “Verified organization” means Sidewalk staff
            checked an institution’s identity from sources they could reach themselves. It is not a
            government accreditation, it does not make the organization’s statements true, and it
            can be withdrawn.
          </li>
          <li>
            Sidewalk does not guarantee that a problem will be fixed, or that a report is accurate.
            It guarantees that what was said, and what was checked, stays visible.
          </li>
          <li>
            Photographs on this site’s marketing pages are illustrative and licensed. They are never
            offered as evidence of a reported problem. Evidence is only ever what a reporter
            uploaded to their own report.
          </li>
        </ul>
        <p>
          See something wrong on a report?{" "}
          <Link href="/guidelines" className="link">
            Flag it
          </Link>
          .
        </p>
      </Block>
    </PageShell>
  );
}
