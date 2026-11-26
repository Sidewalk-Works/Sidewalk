"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { LIMITS, type CategoryDto, type ReportDetailDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/client-api";
import { useHydrated } from "@/lib/use-hydrated";
import { CategoryPicker } from "./category-picker";
import { LocationPicker } from "./location-picker";
import { reportSchema, type ReportValues } from "./schema";

export function EditReportForm({
  report,
  categories
}: {
  report: ReportDetailDto;
  categories: CategoryDto[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ReportValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      categorySlug: report.category.slug,
      title: report.title,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      addressText: report.addressText ?? "",
      areaName: report.areaName ?? "",
      showReporterName: report.reporterName !== null
    }
  });
  const { control, register, formState, watch, setValue } = form;
  const { errors, isSubmitting } = formState;
  const hydrated = useHydrated();
  // eslint-disable-next-line react-hooks/incompatible-library
  const values = watch();

  return (
    <form
      noValidate
      method="post"
      className="space-y-8"
      onSubmit={form.handleSubmit(async (v) => {
        setFormError(null);
        try {
          await api(`/reports/${report.reference}`, {
            method: "PATCH",
            json: {
              ...v,
              addressText: v.addressText?.trim() ?? "",
              areaName: v.areaName?.trim() ?? ""
            }
          });
          router.push(`/issues/${report.reference}`);
          router.refresh();
        } catch (e) {
          if (e instanceof ApiError)
            for (const d of e.details)
              if (d.field in v)
                form.setError(d.field as keyof ReportValues, { message: d.message });
          setFormError(
            e instanceof ApiError ? e.message : "Something went wrong. Please try again."
          );
        }
      })}
    >
      {formError && <Alert tone="error">{formError}</Alert>}
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
      <Field label="Title" error={errors.title?.message} required>
        <Input maxLength={LIMITS.title.max} {...register("title")} />
      </Field>
      <Field label="Description" error={errors.description?.message} required>
        <Textarea
          maxLength={LIMITS.description.max}
          className="min-h-40"
          {...register("description")}
        />
      </Field>
      <LocationPicker
        value={{
          latitude: values.latitude,
          longitude: values.longitude,
          areaName: values.areaName
        }}
        categorySlug={values.categorySlug}
        excludeReference={report.reference}
        errorMessage={errors.latitude?.message ?? errors.longitude?.message}
        onChange={(loc) => {
          if (loc.latitude !== null && loc.longitude !== null) {
            setValue("latitude", loc.latitude, { shouldDirty: true });
            setValue("longitude", loc.longitude, { shouldDirty: true });
          }
          if (loc.areaName) setValue("areaName", loc.areaName, { shouldDirty: true });
        }}
      />
      <Field label="Street, landmark or directions" error={errors.addressText?.message} optional>
        <Input maxLength={LIMITS.address.max} {...register("addressText")} />
      </Field>
      <Field label="Area or neighbourhood" optional>
        <Input maxLength={120} {...register("areaName")} />
      </Field>
      <div className="border-2 border-ink bg-surface p-5">
        <Checkbox
          {...register("showReporterName")}
          label="Show my name on this report"
          hint="If off, the public sees “a resident”."
        />
      </div>
      <div className="flex flex-wrap gap-3 border-t-2 border-ink pt-6">
        <Button type="submit" size="lg" loading={isSubmitting} disabled={!hydrated}>
          Save changes
        </Button>
        <ButtonLink href={`/issues/${report.reference}`} variant="secondary" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
