"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "./account-menu";

interface Props {
  links: Array<{ href: string; label: string }>;
  user: { name: string; role: string; unread?: number } | null;
}

export function MobileNav({ links, user }: Props) {
  const pathname = usePathname();
  // The menu is "open for the page it was opened on", so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const staff = user && (user.role === "MODERATOR" || user.role === "ADMIN");
  const big =
    "block border-b border-rule py-4 font-display text-[2rem] leading-none tracking-tight";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex min-h-11 items-center bg-ink px-5 font-semibold text-paper md:hidden">
        Menu
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] flex-col overflow-y-auto bg-paper p-6 shadow-lift">
          <div className="flex items-center justify-between">
            <Dialog.Title className="eyebrow">Menu</Dialog.Title>
            <Dialog.Close
              className="-m-2 inline-flex size-11 items-center justify-center"
              aria-label="Close menu"
            >
              <X className="size-6" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
          <nav aria-label="Mobile" className="mt-6 flex-1">
            <Link href="/report" className={`${big} text-laterite`}>
              Report an issue
            </Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={big}>
                {l.label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/dashboard" className={big}>
                  My reports
                </Link>
                <Link href="/notifications" className={big}>
                  Notifications{user.unread ? ` (${user.unread})` : ""}
                </Link>
                <Link href="/account" className={big}>
                  Account
                </Link>
                {staff && (
                  <Link href="/admin" className={big}>
                    Moderation
                  </Link>
                )}
              </>
            )}
          </nav>
          <div className="mt-8 border-t-2 border-ink pt-5">
            {user ? (
              <div className="space-y-3">
                <p className="text-muted">Signed in as {user.name}</p>
                <SignOutButton className="min-h-11 border-2 border-ink px-5 font-semibold" />
              </div>
            ) : (
              <div className="flex gap-3">
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center border-2 border-ink px-5 font-semibold"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center px-3 font-semibold underline underline-offset-4"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
