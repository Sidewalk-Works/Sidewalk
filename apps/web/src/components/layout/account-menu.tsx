"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { hardNavigate } from "@/lib/navigate";

async function signOut() {
  await api("/auth/logout", { method: "POST", json: {} }).catch(() => undefined);
  hardNavigate("/");
}

export function SignOutButton({
  className,
  children
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={() => void signOut()}>
      {children ?? "Sign out"}
    </button>
  );
}

const item =
  "flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 text-[0.975rem] outline-none data-[highlighted]:bg-ink data-[highlighted]:text-paper";

export function AccountMenu({ name, role }: { name: string; role: string }) {
  const staff = role === "MODERATOR" || role === "ADMIN";
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex min-h-11 items-center gap-2 border-2 border-transparent px-3 font-semibold hover:border-ink data-[state=open]:border-ink">
        <span
          className="grid size-7 place-items-center bg-ink text-[0.8rem] font-bold uppercase text-paper"
          aria-hidden
        >
          {name.slice(0, 1)}
        </span>
        <span className="max-w-[9rem] truncate">{name}</span>
        <ChevronDown className="size-4" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-40 min-w-56 border-2 border-ink bg-surface shadow-lift"
        >
          <Menu.Item asChild>
            <Link href="/dashboard" className={item}>
              My reports
            </Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link href="/account" className={item}>
              <User className="size-4" aria-hidden /> Account settings
            </Link>
          </Menu.Item>
          {staff && (
            <Menu.Item asChild>
              <Link href="/admin" className={item}>
                <ShieldCheck className="size-4" aria-hidden /> Moderation
              </Link>
            </Menu.Item>
          )}
          <Menu.Separator className="h-px bg-rule" />
          <Menu.Item className={item} onSelect={() => void signOut()}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
