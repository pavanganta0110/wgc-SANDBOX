import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";

type InvoiceExportRow = {
  invoice: Awaited<ReturnType<typeof prisma.invoice.findMany>>[number];
  client: { displayName: string; email: string | null } | undefined;
  feeContributionCents: number;
  totalChargedCents: number;
};

function columns(): CsvColumn<InvoiceExportRow>[] {
  return [
    { header: "Invoice Number", value: (r) => r.invoice.invoiceNumber },
    { header: "Status", value: (r) => r.invoice.status },
    { header: "Client", value: (r) => r.client?.displayName || "" },
    { header: "Client Email", value: (r) => r.client?.email || "" },
    { header: "Classification", value: (r) => r.invoice.classification },
    { header: "Issue Date", value: (r) => r.invoice.issueDate.toISOString().slice(0, 10) },
    { header: "Due Date", value: (r) => r.invoice.dueDate.toISOString().slice(0, 10) },
    { header: "Subtotal", value: (r) => formatCents(r.invoice.subtotalCents) },
    { header: "Discount", value: (r) => formatCents(r.invoice.discountCents) },
    { header: "Tax", value: (r) => formatCents(r.invoice.taxCents) },
    { header: "Total", value: (r) => formatCents(r.invoice.totalCents) },
    // Invoice-amount paid — never includes any customer fee contribution,
    // so this can never make the invoice look overpaid.
    { header: "Paid (Invoice Amount)", value: (r) => formatCents(r.invoice.amountPaidCents) },
    { header: "Customer Fee Contributions", value: (r) => formatCents(r.feeContributionCents) },
    { header: "Total Charged to Customer", value: (r) => formatCents(r.totalChargedCents) },
    { header: "Refunded", value: (r) => formatCents(r.invoice.refundedCents) },
    { header: "Balance", value: (r) => formatCents(r.invoice.balanceCents) },
    { header: "Created By", value: (r) => r.invoice.createdByEmail || "" },
    { header: "Created", value: (r) => r.invoice.createdAt.toISOString() },
  ];
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canExportInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  // Fundraiser/viewer exports are scoped to their own invoices, mirroring
  // the list page's own visibility rule — export must never leak a wider
  // slice of data than the dashboard already shows this role.
  const scopedToUserId = auth.role === "fundraiser" || auth.role === "viewer" ? auth.userId : undefined;

  const invoices = await prisma.invoice.findMany({
    where: { churchId: auth.churchId, ...(status ? { status } : {}), ...(scopedToUserId ? { createdByUserId: scopedToUserId } : {}) },
    orderBy: { createdAt: "desc" },
  });

  const clientIds = [...new Set(invoices.map((i) => i.clientId))];
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, displayName: true, email: true } });
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const invoiceIds = invoices.map((i) => i.id);
  const feeTotals = invoiceIds.length
    ? await prisma.invoicePayment.groupBy({
        by: ["invoiceId"],
        where: { invoiceId: { in: invoiceIds }, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
        _sum: { feeContributionCents: true, totalChargedCents: true },
      })
    : [];
  const feeTotalsByInvoice = new Map(feeTotals.map((f) => [f.invoiceId, f]));

  const rows: InvoiceExportRow[] = invoices.map((invoice) => ({
    invoice,
    client: clientById.get(invoice.clientId),
    feeContributionCents: feeTotalsByInvoice.get(invoice.id)?._sum.feeContributionCents ?? 0,
    totalChargedCents: feeTotalsByInvoice.get(invoice.id)?._sum.totalChargedCents ?? 0,
  }));
  const csv = buildCsvExport(rows, columns());

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.exported",
    entityType: "invoice",
    metadata: { rowCount: rows.length, status: status ?? null },
    req,
  });

  return csvResponse(csv, "invoices.csv");
}
