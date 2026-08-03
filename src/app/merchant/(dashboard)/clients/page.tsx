import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { loadClientsList, type ClientsListSort } from "@/lib/clients/clientsList";
import { formatCents } from "@/lib/format";
import Pagination from "@/components/merchant/Pagination";
import ClientRowActions from "@/components/merchant/ClientRowActions";

const PAGE_SIZE = 25;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewInvoices") && !hasPermission(auth, "canManageClients")) {
    redirect("/merchant/dashboard");
  }
  const canManage = hasPermission(auth, "canManageClients");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const archivedStatus = sp.archived === "archived" ? "archived" : sp.archived === "all" ? "all" : "active";
  const sortKey = (["createdAt", "displayName", "totalInvoicedCents", "outstandingBalanceCents"].includes(sp.sort || "")
    ? sp.sort
    : "createdAt") as ClientsListSort["key"];
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const { rows, totalCount } = await loadClientsList(
    auth.churchId,
    { search: sp.q, archivedStatus, clientType: sp.type === "ORGANIZATION" || sp.type === "INDIVIDUAL" ? sp.type : undefined },
    { key: sortKey, dir: sortDir },
    page,
    PAGE_SIZE
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function sortLink(key: ClientsListSort["key"], label: string) {
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (archivedStatus !== "active") params.set("archived", archivedStatus);
    if (sp.type) params.set("type", sp.type);
    params.set("sort", key);
    params.set("dir", nextDir);
    return (
      <Link href={`?${params.toString()}`} className="hover:text-slate-900">
        {label}
        {sortKey === key && <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </Link>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Clients</h2>
        <div className="flex items-center gap-2">
          {canManage && (
            <a href="/api/merchant/clients/export" className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
              Export CSV
            </a>
          )}
          {canManage && (
            <Link
              href="/merchant/clients/new"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              New Client
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 p-4 flex flex-wrap items-center gap-3">
        <form action="/merchant/clients" method="GET" className="flex-1 min-w-[240px]">
          <input
            type="text"
            name="q"
            defaultValue={sp.q || ""}
            placeholder="Search by name, email, phone, organization…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </form>
        <div className="flex gap-2">
          {(["active", "archived", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(s !== "active" ? { archived: s } : {}) }).toString()}`}
              className={`px-4 py-2 rounded-full border text-sm font-medium ${
                archivedStatus === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "active" ? "Active" : s === "archived" ? "Archived" : "All"}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">{sortLink("displayName", "Client")}</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Phone</th>
                <th className="px-6 py-3 text-right">{sortLink("totalInvoicedCents", "Total Invoiced")}</th>
                <th className="px-6 py-3 text-right">{sortLink("outstandingBalanceCents", "Outstanding")}</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(({ client, aggregates }) => (
                <tr key={client.id}>
                  <td className="px-6 py-3">
                    <Link href={`/merchant/clients/${client.id}`} className="font-semibold text-slate-900 hover:underline">
                      {client.displayName}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{client.clientType === "ORGANIZATION" ? "Organization" : "Individual"}</td>
                  <td className="px-6 py-3 text-slate-600">{client.email || "—"}</td>
                  <td className="px-6 py-3 text-slate-600">{client.phone || "—"}</td>
                  <td className="px-6 py-3 text-right text-slate-900">{formatCents(aggregates.totalInvoicedCents)}</td>
                  <td className="px-6 py-3 text-right text-slate-900">{formatCents(aggregates.outstandingBalanceCents)}</td>
                  <td className="px-6 py-3">
                    {client.archivedAt ? (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Archived</span>
                    ) : (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {canManage && <ClientRowActions clientId={client.id} archived={!!client.archivedAt} />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    No clients yet.{" "}
                    {canManage && (
                      <Link href="/merchant/clients/new" className="text-blue-600 hover:underline">
                        Create your first client
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} />
      </div>
    </div>
  );
}
