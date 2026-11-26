import clsx from "clsx";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  /** Builds the href for a page number, preserving the other filters. */
  hrefFor: (page: number) => string;
}

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const item =
    "inline-flex min-h-11 min-w-11 items-center justify-center border-2 px-3 font-semibold";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={clsx(item, "border-ink hover:bg-ink hover:text-paper gap-2")}
        >
          <ArrowLeft className="size-4" aria-hidden /> Previous
        </Link>
      ) : null}
      <ol className="flex flex-wrap items-center gap-2">
        {list.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            {i > 0 && (list[i - 1] as number) < p - 1 ? (
              <span aria-hidden className="text-muted">
                …
              </span>
            ) : null}
            {p === page ? (
              <span aria-current="page" className={clsx(item, "border-ink bg-ink text-paper")}>
                <span className="sr-only">Page </span>
                {p}
              </span>
            ) : (
              <Link
                href={hrefFor(p)}
                className={clsx(
                  item,
                  "border-transparent underline decoration-rule underline-offset-4 hover:border-ink"
                )}
              >
                <span className="sr-only">Page </span>
                {p}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className={clsx(item, "border-ink hover:bg-ink hover:text-paper gap-2")}
        >
          Next <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
