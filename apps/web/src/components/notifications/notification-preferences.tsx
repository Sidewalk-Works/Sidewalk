"use client";

import { useState } from "react";
import type { NotificationPreferencesDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

export function NotificationPreferences({
  initial,
  verified
}: {
  initial: NotificationPreferencesDto;
  verified: boolean;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const save = useAction(async () => {
    setPrefs(
      await api<NotificationPreferencesDto>("/users/me/notification-preferences", {
        method: "PATCH",
        json: prefs
      })
    );
    setSaved(true);
  });
  const change =
    (key: keyof NotificationPreferencesDto) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setPrefs((p) => ({ ...p, [key]: e.target.checked }));
    };

  return (
    <form
      method="post"
      className="mt-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <p className="text-[0.95rem] text-ink-soft">
        Every update always appears in your notifications here. These choices only decide which also
        reach your inbox.
        {!verified && " Email updates start once your address is confirmed."}
      </p>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <fieldset className="space-y-4">
        <legend className="sr-only">Email me when…</legend>
        <Checkbox
          checked={prefs.reportUpdates}
          onChange={change("reportUpdates")}
          label="A report I filed or follow changes status"
          hint="Acknowledged, in progress, resolved, reopened, or a resolution verified."
        />
        <Checkbox
          checked={prefs.comments}
          onChange={change("comments")}
          label="Someone comments, or staff post an update, on those reports"
        />
        <Checkbox
          checked={prefs.moderation}
          onChange={change("moderation")}
          label="Moderators act on my reports or comments"
        />
      </fieldset>
      <p className="border-l-4 border-ink bg-paper-deep px-4 py-3 text-[0.9rem]">
        <strong>Security emails are separate and always sent:</strong> confirming your address,
        password-reset links, and notices that your password changed. They cannot be switched off.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={save.pending}>
          Save email settings
        </Button>
        <span role="status" className="text-[0.9rem] font-semibold text-kerb">
          {saved ? "Saved." : ""}
        </span>
      </div>
    </form>
  );
}
