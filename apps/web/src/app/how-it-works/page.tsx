import type { Metadata } from "next";
import Link from "next/link";
import { Block, PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "How reporting works" };

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="How it works"
      title="From a problem on your street to a public record"
      intro="Sidewalk does one job: it keeps an honest, public, searchable record of community problems and of what has been said and shown about them since."
    >
      <Block id="report" heading="1. You report">
        <p>
          Create a free account, choose a category, describe what is wrong and pin the exact spot.
          You can search for a place, tap the map, use your phone’s location or type coordinates.
          Add photographs if you have them.
        </p>
        <p>
          Your report gets a reference number such as{" "}
          <span className="font-mono font-semibold">SW-7K4M2Q</span> and a public web address you
          can share. You choose whether your name is shown.
        </p>
      </Block>
      <Block id="review" heading="2. It is reviewed">
        <p>
          New reports go public as <strong>Submitted</strong>. That word is deliberate. It means a
          resident filed the report. It does not mean the problem has been verified, and it does not
          mean any official body has seen it.
        </p>
        <p>
          Sidewalk staff then check the details and move it forward, or close it with a written
          reason if it is a duplicate or out of scope. Closing a report without a repair is never
          presented as a success.
        </p>
      </Block>
      <Block id="follow" heading="3. You follow it">
        <p>
          Every change is added to the report’s timeline: what changed, when, who recorded it (you,
          or “Sidewalk staff”) and the stated reason. Entries are only ever added, so history cannot
          be quietly rewritten. Your dashboard lists what changed and anything that needs you to
          act.
        </p>
        <p>
          Neighbours can add comments and photographs, and anyone signed in can flag a report or
          comment that breaks the{" "}
          <Link href="/guidelines" className="link">
            community guidelines
          </Link>
          .
        </p>
      </Block>
      <Block id="resolve" heading="4. It is resolved, or not">
        <p>
          Anyone can say a problem is fixed, including you, but a statement is not proof. A
          resolution must carry an explanation, and it is labelled{" "}
          <strong>claimed, not verified</strong> until a staff member who did not record it has
          checked photographs of the repair. Residents can reopen a report if the problem comes
          back.
        </p>
        <p>
          Read the full rules in{" "}
          <Link href="/accountability" className="link">
            how Sidewalk handles trust
          </Link>
          .
        </p>
      </Block>
      <Block id="start" heading="Ready?">
        <p>Reading public reports never needs an account.</p>
        <div className="mt-5 flex flex-wrap gap-3 not-prose">
          <ButtonLink href="/report">Report an issue</ButtonLink>
          <ButtonLink href="/issues" variant="secondary">
            Explore community issues
          </ButtonLink>
        </div>
      </Block>
    </PageShell>
  );
}
