"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { useAction } from "@/lib/use-action";

function CategoryRow({ category }: { category: CategoryDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [active, setActive] = useState(category.isActive);
  const save = useAction(async () => {
    await api(`/admin/categories/${category.id}`, {
      method: "PATCH",
      json: { name, description, isActive: active }
    });
    setEditing(false);
    router.refresh();
  });
  const toggle = useAction(async () => {
    await api(`/admin/categories/${category.id}`, {
      method: "PATCH",
      json: { isActive: !category.isActive }
    });
    router.refresh();
  });

  return (
    <li className="border-b border-rule py-5">
      {editing ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run();
          }}
        >
          {save.error && <Alert tone="error">{save.error.message}</Alert>}
          <Field label="Name" error={save.fieldError("name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Description" error={save.fieldError("description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
              maxLength={240}
            />
          </Field>
          <Checkbox
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            label="Active"
            hint="Inactive categories cannot be chosen for new reports. Existing reports keep theirs."
          />
          <div className="flex gap-3">
            <Button type="submit" size="sm" loading={save.pending}>
              Save
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-[1.35rem] leading-tight">
              {category.name}{" "}
              {!category.isActive && (
                <span className="ml-2 border border-danger px-2 py-0.5 font-sans text-[0.7rem] font-bold uppercase tracking-wider text-danger">
                  Inactive
                </span>
              )}
            </p>
            <p className="mt-1 max-w-xl text-[0.925rem] text-muted">{category.description}</p>
            <p className="mt-1 font-mono text-[0.75rem] text-muted">/{category.slug}</p>
            {toggle.error && (
              <p role="alert" className="mt-2 text-[0.85rem] text-danger">
                {toggle.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="quiet"
              loading={toggle.pending}
              onClick={() => void toggle.run()}
            >
              {category.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function CategoryManager({ categories }: { categories: CategoryDto[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useAction(async () => {
    await api("/admin/categories", { method: "POST", json: { name, description } });
    setName("");
    setDescription("");
    router.refresh();
  });
  return (
    <div className="grid gap-14 lg:grid-cols-[1fr_22rem]">
      <ul className="border-t-2 border-ink">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>
      <form
        className="space-y-4 self-start border-2 border-ink bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void create.run();
        }}
      >
        <h3 className="font-sans text-lg font-bold">Add a category</h3>
        {create.error && <Alert tone="error">{create.error.message}</Alert>}
        <Field label="Name" error={create.fieldError("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field
          label="Description"
          hint="Shown to residents when they choose a category."
          error={create.fieldError("description")}
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-20"
            maxLength={240}
          />
        </Field>
        <Button
          type="submit"
          loading={create.pending}
          disabled={name.trim().length < 3 || description.trim().length < 10}
        >
          Add category
        </Button>
      </form>
    </div>
  );
}
