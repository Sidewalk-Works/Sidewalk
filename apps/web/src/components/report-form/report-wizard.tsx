"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { LIMITS, STATUS_INFO, type CategoryDto, type ReportDetailDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { EvidencePicker } from "@/components/report/evidence-picker";
import { ShareButton } from "@/components/report/share-button";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/client-api";
import { formatBytes } from "@/lib/files";
import { uploadAll } from "@/lib/upload";
import { useHydrated } from "@/lib/use-hydrated";
import { CategoryPicker } from "./category-picker";
import { LocationPicker } from "./location-picker";
import { reportSchema, type ReportValues } from "./schema";

const STEPS = [
  { id: "what", label: "What happened", fields: ["categorySlug", "title", "description"] as const },
  { id: "where", label: "Where it is", fields: ["latitude", "longitude", "addressText"] as const },
  { id: "photos", label: "Photographs", fields: [] as const },
  { id: "review", label: "Review and send", fields: [] as const }
];

interface Created {
  report: ReportDetailDto;
  failed: File[];
}

/** Starting another report remounts the form, which also issues a fresh idempotency key. */
export function ReportWizard({ categories }: { categories: CategoryDto[] }) {
  const [run, setRun] = useState(0);
  return (
    <WizardInner
      key={run}
      categories={categories}
      onAnother={() => (window.scrollTo({ top: 0 }), setRun((r) => r + 1))}
    />
  );
}

function WizardInner({
  categories,
  onAnother
}: {
  categories: CategoryDto[];
  onAnother: () => void;
}) {
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  // One id per form: if the request is retried or double-clicked, the server returns the same report.
  const [requestId] = useState(() => crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const hydrated = useHydrated();

  const form = useForm<ReportValues>({
    resolver: zodResolver(reportSchema),
    mode: "onTouched",
    defaultValues: {
      categorySlug: "",
      title: "",
      description: "",
      addressText: "",
      areaName: "",
      showReporterName: false
    }
  });
  const { control, register, formState, trigger, watch, setValue } = form;
  const { errors, isSubmitting } = formState;

  // Move focus to the new step's heading so keyboard and screen reader users land in the right place.
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step, created]);

  async function next() {
    const ok = await trigger(STEPS[step]?.fields as unknown as Array<keyof ReportValues>);
    if (ok) {
      setFormError(null);
      // Based on the step that was validated, so a double click can never skip a step.
      setStep(Math.min(step + 1, STEPS.length - 1));
    }
  }

  async function submit(values: ReportValues) {
    setFormError(null);
    setProgress(null);
    try {
      const report = await api<ReportDetailDto>("/reports", {
        method: "POST",
        json: {
          ...values,
          addressText: values.addressText?.trim() || undefined,
          areaName: values.areaName?.trim() || undefined,
          clientRequestId: requestId
        }
      });
      let failed: File[] = [];
      if (files.length > 0) {
        const outcomes = await uploadAll(report.reference, files, "REPORT", (d, t) =>
          setProgress(`Uploading photograph ${d} of ${t}…`)
        );
        failed = outcomes.filter((o) => !o.ok).map((o) => o.file);
      }
      setCreated({ report, failed });
    } catch (e) {
      if (e instanceof ApiError && e.details.length > 0) {
        for (const d of e.details) {
          if (d.field in values)
            form.setError(d.field as keyof ReportValues, { message: d.message });
        }
        const firstField = e.details[0]?.field;
        const owner = STEPS.findIndex((s) =>
          (s.fields as readonly string[]).includes(firstField ?? "")
        );
        if (owner >= 0) setStep(owner);
      }
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  }

  if (created)
    return (
      <Confirmation
        created={created}
        onRetried={(report, failed) => setCreated({ report, failed })}
        onAnother={onAnother}
        headingRef={heading}
      />
    );

  // eslint-disable-next-line react-hooks/incompatible-library
  const values = watch();
  const category = categories.find((c) => c.slug === values.categorySlug);
  const latitude = watch("latitude");
  const longitude = watch("longitude");

  return (
    <form
      noValidate
      method="post"
      onSubmit={(e) => {
        // Only the final step may send the report, however a submit was triggered.
        if (step !== STEPS.length - 1) {
          e.preventDefault();
          return;
        }
        return form.handleSubmit(submit)(e);
      }}
      className="mx-auto max-w-3xl"
    >
      <nav aria-label="Progress">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.id} aria-current={i === step ? "step" : undefined}>
              <div className={`h-1.5 ${i <= step ? "bg-laterite" : "bg-rule"}`} />
              <p
                className={`mt-2 hidden text-[0.8rem] sm:block ${i === step ? "font-bold" : "text-muted"}`}
              >
                {i + 1}. {s.label}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.9rem] font-semibold sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]?.label}
        </p>
      </nav>

      <h2 ref={heading} tabIndex={-1} className="display-md mt-8 outline-none">
        {step === 0 && "What is the problem?"}
        {step === 1 && "Where is it?"}
        {step === 2 && "Add photographs"}
        {step === 3 && "Check it, then send it"}
      </h2>
      <p className="sr-only" aria-live="polite">
        Step {step + 1} of {STEPS.length}
      </p>

      <div className="mt-8 space-y-8">
        {formError && <Alert tone="error">{formError}</Alert>}

        {step === 0 && (
          <>
            <Controller
              control={control}
              name="categorySlug"
              render={({ field }) => (
                <CategoryPicker
                  categories={categories}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.categorySlug?.message}
                />
              )}
            />
            <Field
              label="Title"
              hint="Short and specific, like “Open manhole on Adeola Odeku Street”."
              error={errors.title?.message}
              required
            >
              <Input maxLength={LIMITS.title.max} autoComplete="off" {...register("title")} />
            </Field>
            <Field
              label="Describe what you saw"
              hint="What is wrong, how long it has been like this, and who it affects. Avoid names and phone numbers."
              error={errors.description?.message}
              required
            >
              <Textarea
                maxLength={LIMITS.description.max}
                className="min-h-40"
                {...register("description")}
              />
            </Field>
            <p className="text-right text-[0.8125rem] text-muted">
              {(values.description ?? "").length} / {LIMITS.description.max}
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <LocationPicker
              value={{
                latitude: Number.isFinite(latitude) ? latitude : null,
                longitude: Number.isFinite(longitude) ? longitude : null,
                areaName: values.areaName
              }}
              categorySlug={values.categorySlug}
              errorMessage={errors.latitude?.message ?? errors.longitude?.message}
              onChange={(loc) => {
                if (loc.latitude !== null && loc.longitude !== null) {
                  setValue("latitude", loc.latitude, { shouldValidate: true });
                  setValue("longitude", loc.longitude, { shouldValidate: true });
                }
                if (loc.areaName) setValue("areaName", loc.areaName);
              }}
            />
            <Field
              label="Street, landmark or directions"
              hint="Anything that helps someone find the exact spot, like “opposite the filling station”."
              error={errors.addressText?.message}
              optional
            >
              <Input maxLength={LIMITS.address.max} {...register("addressText")} />
            </Field>
            <Field
              label="Area or neighbourhood"
              hint="Filled in for you if you used search."
              optional
            >
              <Input maxLength={120} {...register("areaName")} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="max-w-xl text-ink-soft">
              Photographs make a report far more credible. They are checked on your device first,
              then cleaned on our server: location data hidden inside the file is removed, and files
              that are not real images are refused.
            </p>
            <EvidencePicker
              files={files}
              onChange={setFiles}
              max={LIMITS.evidence.maxPerSubmission}
            />
            <p className="text-[0.85rem] text-muted">
              Photographs are optional. You can also add more later from your dashboard.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <dl className="divide-y divide-rule border-y-2 border-ink">
              <Row label="Category" value={category?.name ?? "—"} onEdit={() => setStep(0)} />
              <Row label="Title" value={values.title} onEdit={() => setStep(0)} />
              <Row
                label="Description"
                value={values.description}
                onEdit={() => setStep(0)}
                multiline
              />
              <Row
                label="Location"
                value={[
                  values.addressText,
                  values.areaName,
                  Number.isFinite(latitude)
                    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onEdit={() => setStep(1)}
              />
              <Row
                label="Photographs"
                value={
                  files.length === 0
                    ? "None"
                    : `${files.length} (${formatBytes(files.reduce((n, f) => n + f.size, 0))})`
                }
                onEdit={() => setStep(2)}
              />
            </dl>

            <div className="border-2 border-ink bg-surface p-5">
              <Checkbox
                {...register("showReporterName")}
                label="Show my name on this report"
                hint="Off by default. If off, the public sees “a resident”. Comments always show your name. You can change this later."
              />
            </div>

            <Alert tone="info" title="What happens when you send this">
              Your report becomes public straight away with the status “
              {STATUS_INFO.SUBMITTED.label}”. That means a resident filed it. It does not mean
              anyone official has acknowledged it. Staff review it, and every change is recorded on
              its timeline.
            </Alert>
          </>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-6">
        {step > 0 ? (
          <Button
            variant="secondary"
            onClick={() => setStep(step - 1)}
            icon={<ArrowLeft className="size-4" aria-hidden />}
            disabled={isSubmitting}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          // Separate keys: React must not turn the "Continue" button into the submit button mid-click,
          // or the same click would submit the form.
          <Button key="continue" onClick={next} size="lg" disabled={!hydrated}>
            Continue <ArrowRight className="size-5" aria-hidden />
          </Button>
        ) : (
          <Button key="send" type="submit" size="lg" loading={isSubmitting}>
            {isSubmitting ? (progress ?? "Sending…") : "Send report"}
          </Button>
        )}
      </div>
      {progress && (
        <p role="status" className="mt-3 text-right text-[0.9rem] text-muted">
          {progress}
        </p>
      )}
    </form>
  );
}

function Row({
  label,
  value,
  onEdit,
  multiline
}: {
  label: string;
  value: string;
  onEdit: () => void;
  multiline?: boolean;
}) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <span className={multiline ? "whitespace-pre-line" : ""}>{value || "—"}</span>
        <button
          type="button"
          onClick={onEdit}
          className="text-[0.9rem] font-semibold underline decoration-rule underline-offset-2 hover:decoration-ink"
        >
          Change<span className="sr-only"> {label.toLowerCase()}</span>
        </button>
      </dd>
    </div>
  );
}

function Confirmation({
  created,
  onRetried,
  onAnother,
  headingRef
}: {
  created: Created;
  onRetried: (r: ReportDetailDto, failed: File[]) => void;
  onAnother: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { report } = created;
  const [retryFiles, setRetryFiles] = useState<File[]>(created.failed);
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3 text-kerb">
        <span className="grid size-10 place-items-center bg-kerb text-white" aria-hidden>
          <Check className="size-6" />
        </span>
        <p className="eyebrow !text-kerb">Report sent</p>
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="display-lg mt-4 outline-none">
        Your report is public.
      </h2>
      <div className="mt-8 border-2 border-ink bg-surface p-6">
        <p className="eyebrow">Reference number</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-wider" data-testid="reference">
          {report.reference}
        </p>
        <p className="mt-3 text-ink-soft">
          Keep this number. Anyone can use it to find your report, and it never changes.
        </p>
      </div>
      <p className="mt-6 max-w-xl text-lg text-ink-soft">
        Its status is <strong>{STATUS_INFO[report.status].label}</strong>:{" "}
        {STATUS_INFO[report.status].meaning} Every update will appear on its timeline and in your
        dashboard.
      </p>

      {created.failed.length > 0 && retryFiles.length > 0 && (
        <div className="mt-8 space-y-3">
          <Alert
            tone="warn"
            title={`${retryFiles.length} photograph${retryFiles.length === 1 ? "" : "s"} could not be uploaded`}
          >
            The report itself was saved. Retry the upload, or add photographs later from the report
            page.
          </Alert>
          {msg && <Alert tone="error">{msg}</Alert>}
          <EvidencePicker
            files={retryFiles}
            onChange={setRetryFiles}
            max={LIMITS.evidence.maxPerSubmission}
          />
          <Button
            variant="secondary"
            loading={retrying}
            onClick={async () => {
              setRetrying(true);
              setMsg(null);
              const outcomes = await uploadAll(report.reference, retryFiles, "REPORT");
              const failed = outcomes.filter((o) => !o.ok);
              setRetryFiles(failed.map((f) => f.file));
              if (failed.length > 0) setMsg(failed[0]?.error ?? "Upload failed.");
              else onRetried(report, []);
              setRetrying(false);
            }}
          >
            Retry upload
          </Button>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <ButtonLink
          href={`/issues/${report.reference}`}
          size="lg"
          icon={<ArrowRight className="size-5" aria-hidden />}
        >
          View your report
        </ButtonLink>
        <ButtonLink href="/dashboard" variant="secondary" size="lg">
          Go to my dashboard
        </ButtonLink>
        <ShareButton path={`/issues/${report.reference}`} />
      </div>
      <p className="mt-8 text-[0.9rem] text-muted">
        Want to report something else?{" "}
        <button type="button" className="link font-semibold" onClick={onAnother}>
          Start another report
        </button>
        .
      </p>
    </div>
  );
}
