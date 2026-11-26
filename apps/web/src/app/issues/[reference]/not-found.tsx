import { ButtonLink } from "@/components/ui/button";

export default function ReportNotFound() {
  return (
    <div className="wrap py-24">
      <p className="eyebrow">Report not found</p>
      <h1 className="display-lg mt-3 max-w-3xl">There is no public report with that reference.</h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Check the reference for typos (they look like SW-7K4M2Q). A report can also disappear from
        public view if moderators hid it or its author deleted their account’s content.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/issues">Search public reports</ButtonLink>
      </div>
    </div>
  );
}
