import type { Metadata } from "next";
import type { CategoryDto } from "@sidewalk/contracts";
import { ReportWizard } from "@/components/report-form/report-wizard";
import { requireVerifiedUser, serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Report an issue",
  robots: { index: false, follow: false }
};

export default async function ReportPage() {
  await requireVerifiedUser("/report");
  const { items } = await serverFetch<{ items: CategoryDto[] }>("/categories");
  return (
    <div className="wrap py-12 lg:py-16">
      <header className="mx-auto max-w-3xl">
        <p className="eyebrow">Report an issue</p>
        <h1 className="display-lg mt-2">Tell us what is wrong, and where.</h1>
        <p className="mt-4 text-lg text-ink-soft">
          Four short steps. Your report is public once you send it, so keep personal details out of
          it.
        </p>
      </header>
      <div className="mt-12">
        <ReportWizard categories={items} />
      </div>
    </div>
  );
}
