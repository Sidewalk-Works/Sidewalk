import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="wrap py-24">
      <p className="eyebrow">Error 404</p>
      <h1 className="display-lg mt-3 max-w-3xl">We could not find that page.</h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        The report may have been removed, the reference may have a typo, or the link may be out of
        date. Reference numbers look like SW-7K4M2Q.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/issues">Explore public reports</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Go to the homepage
        </ButtonLink>
      </div>
    </div>
  );
}
