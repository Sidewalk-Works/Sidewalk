import type { CategoryDto } from "@sidewalk/contracts";
import { CategoryManager } from "@/components/admin/category-manager";
import { requireAdmin, serverFetch } from "@/lib/server-api";

export default async function CategoriesPage() {
  await requireAdmin("/admin/categories");
  const { items } = await serverFetch<{ items: CategoryDto[] }>("/admin/categories");
  return (
    <section aria-labelledby="cats">
      <h2 id="cats" className="display-md">
        Report categories
      </h2>
      <p className="mb-8 mt-2 max-w-xl text-muted">
        Categories group reports for residents and filters. Renaming never changes a category’s web
        address, and at least one category must stay active.
      </p>
      <CategoryManager categories={items} />
    </section>
  );
}
