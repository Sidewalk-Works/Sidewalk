"use client";

import clsx from "clsx";
import type { CategoryDto } from "@sidewalk/contracts";

interface Props {
  categories: CategoryDto[];
  value: string;
  onChange: (slug: string) => void;
  error?: string;
}

/** Radio group, not a dropdown: every option and its description is visible at once. */
export function CategoryPicker({ categories, value, onChange, error }: Props) {
  return (
    <fieldset aria-describedby="category-error">
      <legend className="font-semibold">
        Category <span className="font-normal text-muted">(choose one)</span>
      </legend>
      <div className="mt-3 grid gap-px border-2 border-ink bg-ink sm:grid-cols-2">
        {categories.map((c) => (
          <label
            key={c.id}
            className={clsx(
              "flex cursor-pointer items-start gap-3 bg-surface px-4 py-3.5 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-[-3px] has-[:focus-visible]:outline-ink",
              value === c.slug ? "bg-ink text-paper" : "hover:bg-paper-deep"
            )}
          >
            <input
              type="radio"
              name="category"
              value={c.slug}
              checked={value === c.slug}
              onChange={() => onChange(c.slug)}
              className="mt-1.5 size-4 shrink-0 accent-laterite"
            />
            <span>
              <span className="block font-semibold leading-snug">{c.name}</span>
              <span
                className={clsx(
                  "mt-0.5 block text-[0.85rem] leading-snug",
                  value === c.slug ? "text-paper/80" : "text-muted"
                )}
              >
                {c.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p
        id="category-error"
        role={error ? "alert" : undefined}
        className="mt-2 min-h-[1.4rem] text-[0.9rem] font-medium text-danger"
      >
        {error}
      </p>
    </fieldset>
  );
}
