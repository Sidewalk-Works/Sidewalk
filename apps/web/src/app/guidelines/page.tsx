import type { Metadata } from "next";
import { FLAG_REASON_LABELS } from "@sidewalk/contracts";
import { Block, PageShell } from "@/components/content/page-shell";

export const metadata: Metadata = { title: "Community guidelines" };

export default function GuidelinesPage() {
  return (
    <PageShell
      eyebrow="Community guidelines"
      title="Keep it factual, local and kind"
      intro="Reports and comments are public. These guidelines keep the record useful and safe for the people in it."
    >
      <Block id="do" heading="Do">
        <ul>
          <li>Describe what you saw, where, and for how long.</li>
          <li>Be specific about the location. A pin and a landmark help more than adjectives.</li>
          <li>Photograph the problem itself. Frame out faces and number plates where you can.</li>
          <li>Say so when something you reported has been fixed, and reopen it if it has not.</li>
        </ul>
      </Block>
      <Block id="dont" heading="Do not">
        <ul>
          <li>Post phone numbers, home addresses of private people, or other personal details.</li>
          <li>
            Accuse named individuals of crimes or misconduct. Describe the problem, not a person.
          </li>
          <li>Post advertising, spam or unrelated content.</li>
          <li>Report private disputes. Sidewalk is for shared, public problems.</li>
          <li>
            Pretend to speak for an agency. Only verified organizations can post official responses,
            and Sidewalk staff updates are labelled as staff and are not government statements.
          </li>
        </ul>
      </Block>
      <Block id="flags" heading="Flagging">
        <p>Signed-in residents can flag a report or comment. The reasons are:</p>
        <ul>
          {Object.values(FLAG_REASON_LABELS).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>
          Flags go to moderators only. Moderators can hide, remove or restore content, always with a
          written reason. You cannot flag your own content; edit or delete it instead.
        </p>
      </Block>
      <Block id="accounts" heading="Accounts">
        <p>
          Repeated abuse can lead to a suspension. A suspended account is signed out immediately;
          its past content stays as moderators left it.
        </p>
      </Block>
    </PageShell>
  );
}
