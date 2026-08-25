import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
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
  const canCreateInvoices = hasPermission(auth, "canCreateInvoices");

  const { clientId } = await params;
  const client = await prisma.client.findFirst({ where: { id: clientId, churchId: auth.churchId } });
  if (!client) notFound();

  const linkedDonor = client.linkedDonorId
    ? await prisma.donor.findUnique({ where: { id: client.linkedDonorId }, select: { id: true, name: true } })
    : null;

  const invoices = await prisma.invoice.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, invoiceNumber: true, status: true, totalCents: true, amountPaidCents: true, balanceCents: true, dueDate: true, createdAt: true },
  });

  const totals = invoices.reduce(
    (acc, inv) => {
      if (inv.status === "VOID") return acc;
      acc.totalInvoicedCents += inv.totalCents;
      acc.totalPaidCents += inv.amountPaidCents;
      acc.outstandingBalanceCents += inv.balanceCents;
      return acc;
    },
    { totalInvoicedCents: 0, totalPaidCents: 0, outstandingBalanceCents: 0 }
  );

  return (
    <div>
      <Link href="/merchant/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{client.displayName}</h2>
          <p className="text-sm text-slate-500">{client.clientType === "ORGANIZATION" ? "Organization" : "Individual"}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateInvoices && (
            <Link
              href={`/merchant/invoices/new?clientId=${client.id}`}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              New Invoice
            </Link>
          )}
          {canManage && (
            <Link
              href={`/merchant/clients/${client.id}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-4 h-4" /> Edit
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Total Invoiced</div>
          <div className="text-xl font-bold text-slate-900">{formatCents(totals.totalInvoicedCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Total Paid</div>
          <div className="text-xl font-bold text-slate-900">{formatCents(totals.totalPaidCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Outstanding</div>
          <div className="text-xl font-bold text-slate-900">{formatCents(totals.outstandingBalanceCents)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-2 text-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Contact</h4>
          <div className="flex justify-between"><span className="text-slate-500">Email</span><span>{client.email || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Phone</span><span>{client.phone || "—"}</span></div>
          {client.contactPersonName && <div className="flex justify-between"><span className="text-slate-500">Contact person</span><span>{client.contactPersonName}</span></div>}
          {linkedDonor && (
            <div className="flex justify-between">
              <span className="text-slate-500">Linked donor</span>
              <Link href={`/merchant/donors?id=${linkedDonor.id}`} className="text-blue-600 hover:underline">{linkedDonor.name || "View donor"}</Link>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-2 text-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Billing address</h4>
          {client.billingAddressLine1 ? (
            <div className="text-slate-700">
              <p>{client.billingAddressLine1}</p>
              {client.billingAddressLine2 && <p>{client.billingAddressLine2}</p>}
              <p>{[client.billingCity, client.billingState, client.billingPostalCode].filter(Boolean).join(", ")}</p>
            </div>
          ) : (
            <p className="text-slate-400">No billing address on file.</p>
          )}
        </div>
      </div>

      {client.notes && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Internal notes</h4>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h4 className="text-sm font-bold text-slate-900">Invoice history</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Invoice</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Due</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-right">Paid</th>
                <th className="px-6 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-3">
                    <Link href={`/merchant/invoices/${inv.id}`} className="font-semibold text-slate-900 hover:underline">{inv.invoiceNumber}</Link>
                  </td>
                  <td className="px-6 py-3"><StateBadge state={inv.status} /></td>
                  <td className="px-6 py-3 text-slate-600">{formatCalendarDateUTC(inv.dueDate)}</td>
                  <td className="px-6 py-3 text-right">{formatCents(inv.totalCents)}</td>
                  <td className="px-6 py-3 text-right">{formatCents(inv.amountPaidCents)}</td>
                  <td className="px-6 py-3 text-right">{formatCents(inv.balanceCents)}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">No invoices for this client yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
