import type { Metadata } from "next";
import { InvitationResponse } from "@/components/organizations/invitation-response";
import { getSession } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Organization invitation",
  robots: { index: false },
  referrer: "no-referrer"
};

export default async function AcceptInvitationPage() {
  const user = await getSession();
  return (
    <div className="wrap pb-6 pt-14">
      <header className="max-w-3xl border-b-2 border-ink pb-10">
        <p className="eyebrow">Organizations</p>
        <h1 className="display-lg mt-3">Invitation</h1>
      </header>
      <div className="mt-10 max-w-2xl">
        <InvitationResponse signedIn={Boolean(user)} emailVerified={Boolean(user?.emailVerified)} />
      </div>
    </div>
  );
}
