import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import InvoiceDetailActions from "@/components/merchant/InvoiceDetailActions";
import InvoicePaymentsPanel from "@/components/merchant/InvoicePaymentsPanel";
import { canEditFinancials, canAcceptPayment, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewInvoices")) redirect("/merchant/dashboard");

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) notFound();

  if (auth.role === "fundraiser" && invoice.createdByUserId !== auth.userId) {
    redirect("/merchant/invoices");
  }

  const [client, lineItems, payments, activity] = await Promise.all([
    prisma.client.findUnique({ where: { id: invoice.clientId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" } }),
    prisma.invoicePayment.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } }),
    prisma.invoiceActivity.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const hasSuccessfulPayment = payments.some((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED");
  const canEdit = hasPermission(auth, "canEditInvoices") && canEditFinancials(invoice.status as InvoiceStatus, hasSuccessfulPayment) && (auth.role !== "fundraiser" || invoice.createdByUserId === auth.userId);

  return (
    <div>
      <Link href="/merchant/invoices" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Invoices
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 font-mono">{invoice.invoiceNumber}</h2>
            <StateBadge state={invoice.status} />
          </div>
          {client && <p className="text-sm text-slate-500">{client.displayName}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/merchant/invoices/${invoice.id}/edit`} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
              <Pencil className="w-4 h-4" /> Edit
            </Link>
          )}
          <InvoiceDetailActions invoiceId={invoice.id} status={invoice.status} canVoid={hasPermission(auth, "canVoidInvoices")} canDuplicate={hasPermission(auth, "canCreateInvoices")} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-lg font-bold text-slate-900">{formatCents(invoice.totalCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Paid</div>
          <div className="text-lg font-bold text-green-700">{formatCents(invoice.amountPaidCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Refunded</div>
          <div className="text-lg font-bold text-slate-900">{formatCents(invoice.refundedCents)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs text-slate-500">Balance</div>
          <div className="text-lg font-bold text-slate-900">{formatCents(invoice.balanceCents)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-sm space-y-2">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Details</h4>
          <div className="flex justify-between"><span className="text-slate-500">Issue date</span><span>{invoice.issueDate.toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Due date</span><span>{invoice.dueDate.toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Classification</span><span>{invoice.classification.replace(/_/g, " ")}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Created by</span><span>{invoice.createdByEmail || "—"}</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-sm space-y-2">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Client</h4>
          {client ? (
            <>
              <div className="flex justify-between"><span className="text-slate-500">Name</span><Link href={`/merchant/clients/${client.id}`} className="text-blue-600 hover:underline">{client.displayName}</Link></div>
              <div className="flex justify-between"><span className="text-slate-500">Email</span><span>{client.email || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Phone</span><span>{client.phone || "—"}</span></div>
            </>
          ) : (
            <p className="text-slate-400">Client not found.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-50">
          <h4 className="text-sm font-bold text-slate-900">Line items</h4>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Description</th>
              <th className="px-6 py-3 text-right">Qty</th>
              <th className="px-6 py-3 text-right">Unit price</th>
              <th className="px-6 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lineItems.map((li) => (
              <tr key={li.id}>
                <td className="px-6 py-3">{li.description}</td>
                <td className="px-6 py-3 text-right">{li.quantity}</td>
                <td className="px-6 py-3 text-right">{formatCents(li.unitPriceCents)}</td>
                <td className="px-6 py-3 text-right">{formatCents(li.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr><td colSpan={3} className="px-6 py-2 text-right text-slate-500">Subtotal</td><td className="px-6 py-2 text-right">{formatCents(invoice.subtotalCents)}</td></tr>
            <tr><td colSpan={3} className="px-6 py-2 text-right text-slate-500">Discount</td><td className="px-6 py-2 text-right">-{formatCents(invoice.discountCents)}</td></tr>
            <tr><td colSpan={3} className="px-6 py-2 text-right text-slate-500">Tax</td><td className="px-6 py-2 text-right">{formatCents(invoice.taxCents)}</td></tr>
            {invoice.serviceFeeCents > 0 && <tr><td colSpan={3} className="px-6 py-2 text-right text-slate-500">Service fee</td><td className="px-6 py-2 text-right">{formatCents(invoice.serviceFeeCents)}</td></tr>}
            <tr className="font-bold text-slate-900"><td colSpan={3} className="px-6 py-3 text-right">Total</td><td className="px-6 py-3 text-right">{formatCents(invoice.totalCents)}</td></tr>
          </tfoot>
        </table>
      </div>

      <InvoicePaymentsPanel
        invoiceId={invoice.id}
        payments={payments.map((p) => ({
          id: p.id,
          createdAt: p.createdAt.toISOString(),
          method: p.method,
          status: p.status,
          grossAmountCents: p.grossAmountCents,
          processingFeeCents: p.processingFeeCents,
          refundedCents: p.refundedCents,
          source: p.source,
        }))}
        balanceCents={invoice.balanceCents}
        canRecordOffline={hasPermission(auth, "canRecordOfflineInvoicePayments")}
        canRefund={hasPermission(auth, "canRefundInvoicePayments")}
        canAcceptPayment={canAcceptPayment(invoice.status as InvoiceStatus)}
      />

      {invoice.internalNotes && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <h4 className="text-sm font-bold text-slate-900 mb-2">Internal notes</h4>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.internalNotes}</p>
        </div>
      )}

      {activity.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Activity</h4>
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.id} className="flex justify-between text-xs text-slate-500">
                <span>{a.activityType.replace(/_/g, " ")}{a.actorEmail ? ` by ${a.actorEmail}` : ""}</span>
                <span>{a.createdAt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
