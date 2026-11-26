"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS, type NotificationPreferencesDto, type UserDto } from "@sidewalk/contracts";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { hardNavigate } from "@/lib/navigate";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/use-action";

interface Session {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function AccountSettings({
  user,
  sessions: initialSessions,
  prefs
}: {
  user: UserDto;
  sessions: Session[];
  prefs: NotificationPreferencesDto;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [sessions, setSessions] = useState(initialSessions);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const profile = useAction(async () => {
    await api("/users/me", { method: "PATCH", json: { displayName: name } });
    setNotice("Your name was updated.");
    router.refresh();
  });
  const password = useAction(async () => {
    await api("/users/me/password", {
      method: "POST",
      json: { currentPassword: current, newPassword: next }
    });
    setCurrent("");
    setNext("");
    setSessions((s) => s.filter((x) => x.current));
    setNotice(
      "Password changed. Every other device was signed out, and we emailed you a confirmation."
    );
  });
  const revoke = useAction(async (id: string) => {
    await api(`/users/me/sessions/${id}`, { method: "DELETE" });
    setSessions((s) => s.filter((x) => x.id !== id));
  });
  const remove = useAction(async () => {
    await api("/users/me", { method: "DELETE", json: { password: deletePassword } });
    hardNavigate("/");
  });

  return (
    <div className="mt-10 grid gap-16 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-14">
        {notice && (
          <Alert tone="success">
            <span role="status">{notice}</span>
          </Alert>
        )}
        <section aria-labelledby="profile">
          <h2 id="profile" className="display-md">
            Profile
          </h2>
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void profile.run();
            }}
          >
            {profile.error && <Alert tone="error">{profile.error.message}</Alert>}
            <Field
              label="Display name"
              hint="Shown on your comments, and on reports where you chose to show your name."
              error={profile.fieldError("displayName")}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={LIMITS.displayName.min}
                maxLength={LIMITS.displayName.max}
                autoComplete="name"
              />
            </Field>
            <Field label="Email address" hint="Used to sign in. It cannot be changed yet.">
              <Input value={user.email} readOnly disabled />
            </Field>
            <p className="-mt-3 text-[0.9rem]">
              {user.emailVerified ? (
                <span className="font-semibold text-kerb">Confirmed.</span>
              ) : (
                <>
                  <span className="font-semibold text-signal">Not confirmed yet.</span>{" "}
                  <a href="/verify-email" className="link font-semibold">
                    Resend the confirmation link
                  </a>
                </>
              )}
            </p>
            <Button
              type="submit"
              loading={profile.pending}
              disabled={
                name.trim() === user.displayName || name.trim().length < LIMITS.displayName.min
              }
            >
              Save profile
            </Button>
          </form>
        </section>

        <section aria-labelledby="notifications">
          <h2 id="notifications" className="display-md">
            Email notifications
          </h2>
          <NotificationPreferences initial={prefs} verified={user.emailVerified} />
        </section>

        <section aria-labelledby="password">
          <h2 id="password" className="display-md">
            Password
          </h2>
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void password.run();
            }}
          >
            {password.error && <Alert tone="error">{password.error.message}</Alert>}
            <Field label="Current password" error={password.fieldError("currentPassword")}>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field
              label="New password"
              hint={`At least ${LIMITS.password.min} characters.`}
              error={password.fieldError("newPassword")}
            >
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Button
              type="submit"
              loading={password.pending}
              disabled={!current || next.length < LIMITS.password.min}
            >
              Change password
            </Button>
          </form>
        </section>
      </div>

      <div className="space-y-14">
        <section aria-labelledby="sessions">
          <h2 id="sessions" className="display-md">
            Where you are signed in
          </h2>
          {revoke.error && (
            <Alert tone="error" className="mt-4">
              {revoke.error.message}
            </Alert>
          )}
          <ul className="mt-5 border-t-2 border-ink">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 border-b border-rule py-4"
              >
                <div>
                  <p className="font-semibold">
                    {deviceName(s.userAgent)}{" "}
                    {s.current && (
                      <span className="ml-2 bg-ink px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-paper">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-[0.85rem] text-muted">
                    Last active {formatDateTime(s.lastUsedAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button size="sm" variant="secondary" onClick={() => void revoke.run(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="danger" className="border-2 border-danger p-6">
          <h2 id="danger" className="display-md">
            Delete account
          </h2>
          <p className="mt-3 text-[0.95rem] text-ink-soft">
            Your name, email and password are erased and you are signed out everywhere. Reports and
            comments you posted stay on the public record, shown as “a resident”, so history is not
            rewritten. This cannot be undone.
          </p>
          <Button variant="danger" className="mt-5" onClick={() => setDeleting(true)}>
            Delete my account
          </Button>
          <Dialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Delete your account?"
            description="Enter your password to confirm."
          >
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void remove.run();
              }}
            >
              {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
              <Field label="Password" error={remove.fieldError("password")}>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="danger"
                  loading={remove.pending}
                  disabled={!deletePassword}
                >
                  Permanently delete
                </Button>
                <Button variant="quiet" onClick={() => setDeleting(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Dialog>
        </section>
      </div>
    </div>
  );
}
