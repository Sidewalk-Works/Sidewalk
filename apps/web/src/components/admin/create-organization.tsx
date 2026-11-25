"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ADMINISTRATIVE_LEVELS,
  ADMINISTRATIVE_LEVEL_INFO,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_INFO,
  type AdministrativeLevel,
  type OrganizationType
} from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

/** Administrators: create an unverified record for an institution, optionally inviting its representative. */
export function CreateOrganization() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<OrganizationType>("AGENCY");
  const [level, setLevel] = useState<AdministrativeLevel>("STATE");
  const [jurisdiction, setJurisdiction] = useState("");
  const [listPublicly, setListPublicly] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const create = useAction(async () => {
    const made = await api<{ id: string }>("/admin/organizations", {
      method: "POST",
      json: {
        name: name.trim(),
        type,
        level,
        jurisdiction: jurisdiction.trim(),
        listPublicly,
        inviteEmail: inviteEmail.trim() || undefined
      }
    });
    router.push(`/admin/organizations/${made.id}`);
  });
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Create an organization record
      </Button>
    );
  return (
    <form
      className="max-w-3xl space-y-2 border-2 border-ink bg-surface p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void create.run();
      }}
    >
      <h3 className="font-sans text-lg font-bold">Create an organization record</h3>
      <p className="text-[0.9rem] text-muted">
        The record starts <strong>unverified</strong>. Inviting someone does not verify them or the
        organization: verification needs an application you approve.
      </p>
      {create.error && <Alert tone="error">{create.error.message}</Alert>}
      <Field label="Official name" required error={create.fieldError("name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={type} onChange={(e) => setType(e.target.value as OrganizationType)}>
            {ORGANIZATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORGANIZATION_TYPE_INFO[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level">
          <Select value={level} onChange={(e) => setLevel(e.target.value as AdministrativeLevel)}>
            {ADMINISTRATIVE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {ADMINISTRATIVE_LEVEL_INFO[l].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Where it has authority" required error={create.fieldError("jurisdiction")}>
        <Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
      </Field>
      <Field label="Invite its representative" optional error={create.fieldError("inviteEmail")}>
        <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
      </Field>
      <Checkbox
        label="List the profile publicly now"
        hint="It will be labelled “Not verified” until an application is approved."
        checked={listPublicly}
        onChange={(e) => setListPublicly(e.target.checked)}
      />
      <div className="flex flex-wrap gap-3 pt-3">
        <Button
          type="submit"
          loading={create.pending}
          disabled={!name.trim() || !jurisdiction.trim()}
        >
          Create record
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
