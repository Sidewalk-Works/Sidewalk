import Link from "next/link";
import { getSession } from "@/lib/server-api";
import { buttonClass } from "@/components/ui/button";
import { AccountMenu } from "./account-menu";
import { NotificationsLink } from "./notifications-link";
import { MobileNav } from "./mobile-nav";
import { Wordmark } from "./wordmark";

export const NAV_LINKS = [
  { href: "/issues", label: "Explore issues" },
  { href: "/organizations", label: "Organizations" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/accountability", label: "Accountability" }
];

export async function SiteHeader() {
  const user = await getSession();
  const mobileUser = user
    ? { name: user.displayName, role: user.role, unread: user.unreadNotifications }
    : null;
  return (
    <header className="border-b-2 border-ink bg-paper">
      <div className="wrap flex min-h-[4.5rem] items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2 font-semibold underline-offset-[0.35em] decoration-2 hover:underline hover:decoration-laterite"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/report" className={buttonClass("primary", "md", "max-sm:hidden")}>
            Report an issue
          </Link>
          {user && <NotificationsLink unread={user.unreadNotifications} />}
          <div className="hidden md:block">
            {user ? (
              <AccountMenu name={user.displayName} role={user.role} />
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center px-3 font-semibold underline decoration-2 underline-offset-[0.35em] decoration-rule hover:decoration-ink"
              >
                Sign in
              </Link>
            )}
          </div>
          <MobileNav links={NAV_LINKS} user={mobileUser} />
        </div>
      </div>
    </header>
  );
}
