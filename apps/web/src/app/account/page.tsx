import type { Metadata } from "next";
import type { NotificationPreferencesDto } from "@sidewalk/contracts";
import { AccountSettings } from "@/components/account/account-settings";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false }
};

interface Session {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [{ items }, prefs] = await Promise.all([
    serverFetch<{ items: Session[] }>("/users/me/sessions"),
    serverFetch<NotificationPreferencesDto>("/users/me/notification-preferences")
  ]);
  return (
    <div className="wrap py-12">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="display-lg mt-2">Account settings</h1>
      </header>
      <AccountSettings user={user} sessions={items} prefs={prefs} />
    </div>
  );
}
