import type { Metadata } from "next";
import { Block, PageShell } from "@/components/content/page-shell";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy"
      title="What Sidewalk keeps, and why"
      intro="This is a plain-language description of how the software behaves. It is not a substitute for a legal privacy policy, which the operator of a live deployment must publish."
    >
      <Block id="collect" heading="What is stored">
        <ul>
          <li>
            <strong>Account:</strong> your email address, display name, and a salted Argon2id hash
            of your password. The password itself is never stored.
          </li>
          <li>
            <strong>Reports and comments:</strong> the text you write, the pin location, and any
            photographs. Reports and comments are public.
          </li>
          <li>
            <strong>Sessions:</strong> a hashed session token, when it was created and last used,
            and a short browser description (for example “Chrome on macOS”) so you can recognise
            your devices. No IP address is stored.
          </li>
          <li>
            <strong>Moderation records:</strong> flags you submit and decisions made about content.
          </li>
        </ul>
      </Block>
      <Block id="public" heading="What is public">
        <p>
          A report’s title, description, category, location, photographs, status history and
          comments are visible to everyone. Your name is shown on a report only if you tick “Show my
          name”, and you can change that any time. Comments show your display name. Your email
          address is never shown.
        </p>
      </Block>
      <Block id="photos" heading="Photographs">
        <p>
          Uploaded photographs are re-encoded on the server. This removes all hidden metadata,
          including the GPS coordinates many phones embed, and rejects files that are not genuine
          images.
        </p>
      </Block>
      <Block id="cookies" heading="Cookies">
        <p>
          Sidewalk sets only the cookies it needs to keep you signed in and to protect forms from
          forgery. There are no advertising or analytics cookies.
        </p>
      </Block>
      <Block id="location" heading="Your location">
        <p>
          Your device location is requested only when you press “Use my location” or “Reports near
          me”. It is used for that action and is not stored on its own.
        </p>
      </Block>
      <Block id="third" heading="Other services involved">
        <ul>
          <li>
            <strong>Map tiles</strong> are loaded from the configured tile server (OpenStreetMap by
            default), which can see your IP address, as with any map.
          </li>
          <li>
            <strong>Place search</strong> sends your search words from Sidewalk’s server to a
            geocoding service. Your IP address is not passed on.
          </li>
        </ul>
      </Block>
      <Block id="deleting" heading="Deleting your account">
        <p>
          From account settings you can delete your account. Your name, email and password hash are
          erased and every session ends. Reports and comments you posted remain on the public
          record, shown as “a resident”, so that accountability history is not rewritten.
        </p>
      </Block>
    </PageShell>
  );
}
