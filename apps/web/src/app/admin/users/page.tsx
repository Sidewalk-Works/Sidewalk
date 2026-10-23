import type { Paginated } from "@sidewalk/contracts";
import { UserRow, type AdminUser } from "@/components/admin/user-manager";
import { Pagination } from "@/components/ui/pagination";
import { requireAdmin, serverFetch } from "@/lib/server-api";

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await requireAdmin("/admin/users");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await serverFetch<Paginated<AdminUser>>(
    `/admin/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`
  );
  return (
    <section aria-labelledby="users">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="users" className="display-md">
            People and roles
          </h2>
          <p className="mt-2 max-w-xl text-muted">
            Moderators can review flags and change report status. Administrators can also manage
            categories, roles and accounts. Every change is audited.
          </p>
        </div>
        <form role="search" className="flex gap-2">
          <label htmlFor="uq" className="sr-only">
            Search people
          </label>
          <input
            id="uq"
            name="q"
            defaultValue={q}
            placeholder="Name or email"
            className="min-h-11 border-2 border-ink/70 bg-surface px-3"
          />
          <button className="min-h-11 border-2 border-ink px-4 font-semibold hover:bg-ink hover:text-paper">
            Search
          </button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-t-2 border-ink text-left">
          <caption className="sr-only">User accounts</caption>
          <thead>
            <tr className="border-b border-rule text-[0.8rem] uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pr-4">
                Person
              </th>
              <th scope="col" className="py-3 pr-4">
                Role
              </th>
              <th scope="col" className="py-3 pr-4">
                Status
              </th>
              <th scope="col" className="py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === me.id} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8">
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(p) => `/admin/users?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        />
      </div>
    </section>
  );
}
