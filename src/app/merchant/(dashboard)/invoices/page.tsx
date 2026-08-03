import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { loadInvoicesList, loadInvoiceSummaryCards, type InvoicesListSort } from "@/lib/invoices/invoicesList";
import { formatCents } from "@/lib/format";
import Pagination from "@/components/merchant/Pagination";
import StateBadge from "@/components/merchant/StateBadge";

const PAGE_SIZE = 25;
const STATUSES = ["DRAFT", "SCHEDULED", "SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "PAST_DUE", "VOID", "UNCOLLECTIBLE"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewInvoices")) redirect("/merchant/dashboard");
  const canCreate = hasPermission(auth, "canCreateInvoices");

  // Fundraiser/viewer are always scoped to their own invoices, per the
  // approved spec — "No access to invoices created by other users unless
  // granted." Owner/admin see the whole organization.
  const scopedToUserId = auth.role === "fundraiser" || auth.role === "viewer" ? auth.userId : undefined;

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const sortKey = (["createdAt", "dueDate", "totalCents", "balanceCents", "status"].includes(sp.sort || "") ? sp.sort : "createdAt") as InvoicesListSort["key"];
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const [{ rows, totalCount }, summary] = await Promise.all([
    loadInvoicesList(
      auth.churchId,
      { search: sp.q, status: sp.status, classification: sp.classification, scopedToUserId },
      { key: sortKey, dir: sortDir },
      page,
      PAGE_SIZE
    ),
    loadInvoiceSummaryCards(auth.churchId, scopedToUserId),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function sortLink(key: InvoicesListSort["key"], label: string) {
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.status) params.set("status", sp.status);
    if (sp.classification) params.set("classification", sp.classification);
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
        <h2 className="text-lg font-bold text-slate-900">Invoices</h2>
        {canCreate && (
          <Link href="/merchant/invoices/new" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            New Invoice
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Draft</div>
          <div className="text-lg font-bold text-slate-900">{summary.draftCount}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Outstanding</div>
          <div className="text-lg font-bold text-slate-900">{formatCents(summary.outstandingCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Past Due</div>
          <div className="text-lg font-bold text-red-600">{formatCents(summary.pastDueCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Partially Paid</div>
          <div className="text-lg font-bold text-slate-900">{summary.partiallyPaidCount}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Paid This Month</div>
          <div className="text-lg font-bold text-green-700">{formatCents(summary.paidThisMonthCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
          <div className="text-xs text-slate-500">Total Outstanding</div>
          <div className="text-lg font-bold text-slate-900">{formatCents(summary.totalOutstandingCents)}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 p-4 flex flex-wrap items-center gap-3">
        <form action="/merchant/invoices" method="GET" className="flex-1 min-w-[240px]">
          <input type="text" name="q" defaultValue={sp.q || ""} placeholder="Search by invoice #, client, memo…" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </form>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), status: s }).toString()}`}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium ${sp.status === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {s.replace(/_/g, " ")}
            </Link>
          ))}
          {sp.status && (
            <Link href="/merchant/invoices" className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-400 hover:text-slate-700">
              Clear
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Invoice</th>
                <th className="px-6 py-3 text-left">Client</th>
                <th className="px-6 py-3 text-left">{sortLink("dueDate", "Due")}</th>
                <th className="px-6 py-3 text-right">{sortLink("totalCents", "Total")}</th>
                <th className="px-6 py-3 text-right">{sortLink("balanceCents", "Balance")}</th>
                <th className="px-6 py-3 text-left">{sortLink("status", "Status")}</th>
                <th className="px-6 py-3 text-left">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-6 py-3">
                    <Link href={`/merchant/invoices/${invoice.id}`} className="font-semibold text-slate-900 hover:underline font-mono text-xs">
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-700">{invoice.clientDisplayName}</td>
                  <td className="px-6 py-3 text-slate-600">{invoice.dueDate.toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-right text-slate-900">{formatCents(invoice.totalCents)}</td>
                  <td className="px-6 py-3 text-right text-slate-900">{formatCents(invoice.balanceCents)}</td>
                  <td className="px-6 py-3"><StateBadge state={invoice.status} /></td>
                  <td className="px-6 py-3 text-xs text-slate-500">{invoice.classification.replace(/_/g, " ")}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No invoices yet.{" "}
                    {canCreate && (
                      <Link href="/merchant/invoices/new" className="text-blue-600 hover:underline">
                        Create your first invoice
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
