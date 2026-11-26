export default function Loading() {
  return (
    <div className="wrap pt-12" role="status" aria-live="polite">
      <span className="sr-only">Loading reports…</span>
      <div className="h-4 w-28 animate-pulse bg-rule" />
      <div className="mt-4 h-14 w-2/3 max-w-xl animate-pulse bg-rule" />
      <div className="mt-12 border-t-2 border-ink">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-4 border-b border-rule py-6 md:grid-cols-[7.5rem_1fr]">
            <div className="hidden aspect-[4/3] animate-pulse bg-paper-deep md:block" />
            <div className="space-y-3">
              <div className="h-3 w-40 animate-pulse bg-rule" />
              <div className="h-7 w-3/4 animate-pulse bg-rule" />
              <div className="h-4 w-full max-w-lg animate-pulse bg-paper-deep" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
