import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { CategoryDto, ReportDetailDto } from "@sidewalk/contracts";
import { EditReportForm } from "@/components/report-form/edit-report-form";
import { requireUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "Edit report", robots: { index: false, follow: false } };

export default async function EditReportPage({
  params
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  await requireUser(`/dashboard/reports/${reference}/edit`);
  const [report, categories] = await Promise.all([
    serverFetch<ReportDetailDto>(`/reports/${reference.toUpperCase()}`),
    serverFetch<{ items: CategoryDto[] }>("/categories")
  ]);
  if (!report.viewer.isOwner) notFound();
  if (!report.viewer.canEdit) redirect(`/issues/${report.reference}`);
  return (
    <div className="wrap py-12">
      <header className="mx-auto max-w-3xl">
        <p className="eyebrow font-mono !tracking-[0.08em]">{report.reference}</p>
        <h1 className="display-lg mt-2">Edit your report</h1>
        <p className="mt-4 text-lg text-ink-soft">
          Changes are public. The timeline will show that the report was edited and which parts
          changed. Earlier wording is kept privately for moderators.
        </p>
      </header>
      <div className="mx-auto mt-10 max-w-3xl">
        <EditReportForm report={report} categories={categories.items} />
      </div>
    </div>
  );
}
