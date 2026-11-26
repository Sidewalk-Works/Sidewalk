"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ADMINISTRATIVE_LEVELS,
  ADMINISTRATIVE_LEVEL_INFO,
  ORGANIZATION_LIMITS as L,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_INFO,
  type AdministrativeLevel,
  type ApplicationDto,
  type OfficialReference,
  type OrganizationType
} from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Describing an institution and the applicant's authority to speak for it. Nothing typed here makes the organization
 * verified: a Sidewalk staff member reviews it, and the evidence asked for depends on the kind of institution.
 */
export function ApplicationEditor({
  application,
  existing
}: {
  application: ApplicationDto | null;
  /** When applying for an organization that already exists and is not verified. */
  existing?: { slug: string; name: string };
}) {
  const router = useRouter();
  const o = application?.organization;
  const [name, setName] = useState(o?.name ?? existing?.name ?? "");
  const [aliases, setAliases] = useState((o?.aliases ?? []).join("\n"));
  const [type, setType] = useState<OrganizationType>(o?.type ?? "AGENCY");
  const [level, setLevel] = useState<AdministrativeLevel>(o?.level ?? "STATE");
  const [jurisdiction, setJurisdiction] = useState(o?.jurisdiction ?? "");
  const [areas, setAreas] = useState((o?.serviceAreas ?? []).join("\n"));
  const [parentSlug, setParentSlug] = useState(o?.parentSlug ?? "");
  const [description, setDescription] = useState(o?.description ?? "");
  const [website, setWebsite] = useState(o?.website ?? "");
  const [publicEmail, setPublicEmail] = useState(o?.publicEmail ?? "");
  const [publicPhone, setPublicPhone] = useState(o?.publicPhone ?? "");
  const [roleTitle, setRoleTitle] = useState(application?.roleTitle ?? "");
  const [authority, setAuthority] = useState(application?.authorityStatement ?? "");
  const [refs, setRefs] = useState<OfficialReference[]>(
    application?.officialReferences?.length
      ? application.officialReferences
      : [{ kind: "", label: "", value: "" }]
  );
  const [saved, setSaved] = useState(false);

  const body = () => ({
    organization: {
      name: name.trim(),
      aliases: lines(aliases),
      type,
      level,
      jurisdiction: jurisdiction.trim(),
      serviceAreas: lines(areas),
      parentSlug: parentSlug.trim() || undefined,
      description: description.trim() || undefined,
      website: website.trim() || undefined,
      publicEmail: publicEmail.trim() || undefined,
      publicPhone: publicPhone.trim() || undefined
    },
    roleTitle: roleTitle.trim() || undefined,
    authorityStatement: authority.trim() || undefined,
    officialReferences: refs
      .map((r) => ({ kind: r.kind.trim(), label: r.label.trim(), value: r.value.trim() }))
      .filter((r) => r.kind || r.label || r.value)
  });

  const save = useAction(async () => {
    setSaved(false);
    if (!application) {
      const created = await api<ApplicationDto>("/organization-applications", {
        method: "POST",
        json: existing
          ? { ...body(), organization: undefined, organizationSlug: existing.slug }
          : body()
      });
      router.push(`/organizations/applications/${created.id}`);
      return;
    }
    await api(`/organization-applications/${application.id}`, { method: "PATCH", json: body() });
    setSaved(true);
    router.refresh();
  });

  const send = useAction(async () => {
    if (!application) return;
    await api(`/organization-applications/${application.id}`, { method: "PATCH", json: body() });
    await api(`/organization-applications/${application.id}/submit`, { method: "POST", json: {} });
    router.refresh();
  });

  const error = save.error ?? send.error;
  const fe = (f: string) => save.fieldError(f) ?? send.fieldError(f);
  const hints = ORGANIZATION_TYPE_INFO[type].referenceHints;
  const readOnlyIdentity = Boolean(existing);

  return (
    <form
      className="space-y-10"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <fieldset className="space-y-2" disabled={readOnlyIdentity}>
        <legend className="display-md">The institution</legend>
        <p className="mb-4 max-w-2xl text-muted">
          Use its full official name. Anything you write here will be public if the application is
          approved.
        </p>
        <Field label="Official name" required error={fe("organization.name") ?? fe("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={L.name.max} />
        </Field>
        <Field
          label="Other names it is known by"
          optional
          hint="One per line. Abbreviations are useful here."
        >
          <Textarea
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            className="min-h-20"
          />
        </Field>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Field label="What kind of institution is it?" required>
            <Select value={type} onChange={(e) => setType(e.target.value as OrganizationType)}>
              {ORGANIZATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORGANIZATION_TYPE_INFO[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level it operates at" required>
            <Select value={level} onChange={(e) => setLevel(e.target.value as AdministrativeLevel)}>
              {ADMINISTRATIVE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {ADMINISTRATIVE_LEVEL_INFO[l].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="-mt-2 text-[0.9rem] text-muted">{ORGANIZATION_TYPE_INFO[type].meaning}</p>
        <Field
          label="Where it has authority"
          required
          hint="The state, local government area or other jurisdiction it serves."
          error={fe("organization.jurisdiction") ?? fe("jurisdiction")}
        >
          <Input
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            maxLength={L.jurisdiction.max}
          />
        </Field>
        <Field label="Areas it serves" optional hint="One per line.">
          <Textarea value={areas} onChange={(e) => setAreas(e.target.value)} className="min-h-20" />
        </Field>
        <Field
          label="Parent organization"
          optional
          hint="The address of an organization already on Sidewalk that this one is part of (for example “ogun-state-ministry-of-works”)."
        >
          <Input value={parentSlug} onChange={(e) => setParentSlug(e.target.value)} />
        </Field>
        <Field label="What it does" optional error={fe("organization.description")}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={L.description.max}
          />
        </Field>
        <div className="grid gap-x-6 sm:grid-cols-3">
          <Field label="Public website" optional error={fe("organization.website")}>
            <Input
              type="url"
              inputMode="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="Public email" optional error={fe("organization.publicEmail")}>
            <Input
              type="email"
              value={publicEmail}
              onChange={(e) => setPublicEmail(e.target.value)}
            />
          </Field>
          <Field label="Public phone" optional>
            <Input value={publicPhone} onChange={(e) => setPublicPhone(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="display-md">Your authority to speak for it</legend>
        <p className="mb-4 max-w-2xl text-muted">
          Sidewalk staff read this, and may ask questions. These details stay private to you and
          staff.
        </p>
        <Field label="Your role there" required error={fe("roleTitle")}>
          <Input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            maxLength={L.roleTitle.max}
          />
        </Field>
        <Field
          label="Why you may speak for it"
          required
          hint="Say plainly how someone could confirm this independently."
          error={fe("authorityStatement")}
        >
          <Textarea
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
            maxLength={L.authorityStatement.max}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="display-md">References staff can check</legend>
        <p className="max-w-2xl text-muted">
          Point staff at published, independent sources. Examples for this kind of institution:
        </p>
        <ul className="max-w-2xl list-disc pl-5 text-[0.95rem] text-ink-soft">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        {refs.map((r, i) => (
          <div
            key={i}
            className="grid gap-x-4 border-t border-rule pt-4 sm:grid-cols-[1fr_1fr_2fr_auto]"
          >
            <Field label="Kind">
              <Input
                value={r.kind}
                onChange={(e) =>
                  setRefs(refs.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))
                }
                maxLength={L.reference.kindMax}
              />
            </Field>
            <Field label="Label">
              <Input
                value={r.label}
                onChange={(e) =>
                  setRefs(refs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                maxLength={L.reference.labelMax}
              />
            </Field>
            <Field label="Citation or link">
              <Input
                value={r.value}
                onChange={(e) =>
                  setRefs(refs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
                maxLength={L.reference.valueMax}
              />
            </Field>
            <div className="pt-7">
              <Button
                variant="quiet"
                aria-label={`Remove reference ${i + 1}`}
                onClick={() => setRefs(refs.filter((_, j) => j !== i))}
                icon={<Trash2 className="size-4" aria-hidden />}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        {refs.length < L.reference.maxCount && (
          <Button
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setRefs([...refs, { kind: "", label: "", value: "" }])}
          >
            Add a reference
          </Button>
        )}
      </fieldset>

      {error && (
        <Alert tone="error">
          {error.message}
          {error.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {error.details.map((d) => (
                <li key={`${d.field}-${d.message}`}>{d.message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {saved && !error && (
        <Alert tone="success">Draft saved. Nobody at Sidewalk has seen it yet.</Alert>
      )}
      <div className="flex flex-wrap gap-3 border-t-2 border-ink pt-6">
        <Button type="submit" loading={save.pending} disabled={send.pending}>
          {application ? "Save draft" : "Start application"}
        </Button>
        {application?.can.submit && (
          <Button
            variant="secondary"
            loading={send.pending}
            disabled={save.pending}
            onClick={() => void send.run()}
          >
            Send to Sidewalk staff
          </Button>
        )}
      </div>
      {application?.can.submit && (
        <p className="max-w-2xl text-[0.875rem] text-muted">
          Sending is not the same as being verified. A staff member reviews it, and may ask you for
          more. Once sent you cannot edit it unless they ask for more information.
        </p>
      )}
    </form>
  );
}
