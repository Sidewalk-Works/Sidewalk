"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="wrap py-24">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display-lg mt-3 max-w-3xl">This page could not load.</h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        {error.message && !error.message.includes("Server Components render")
          ? error.message
          : "Sidewalk hit a problem on our side. Your reports are safe. Try again in a moment."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to the homepage
        </ButtonLink>
      </div>
      {error.digest && (
        <p className="mt-6 text-sm text-muted">Reference for support: {error.digest}</p>
      )}
    </div>
  );
}
