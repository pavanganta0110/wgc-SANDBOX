import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { loadClientAggregatesBatch, type ClientAggregates } from "@/lib/clients/clientsList";

type ClientExportRow = {
  client: Awaited<ReturnType<typeof prisma.client.findMany>>[number];
  aggregates: ClientAggregates | undefined;
};

function columns(): CsvColumn<ClientExportRow>[] {
  return [
    { header: "Name", value: (r) => r.client.displayName },
    { header: "Type", value: (r) => r.client.clientType },
    { header: "Email", value: (r) => r.client.email || "" },
    { header: "Phone", value: (r) => r.client.phone || "" },
    {
      header: "Billing Address",
      value: (r) => [r.client.billingAddressLine1, r.client.billingCity, r.client.billingState, r.client.billingPostalCode].filter(Boolean).join(", "),
    },
    { header: "Total Invoiced", value: (r) => formatCents(r.aggregates?.totalInvoicedCents ?? 0) },
    { header: "Total Paid", value: (r) => formatCents(r.aggregates?.totalPaidCents ?? 0) },
    { header: "Outstanding Balance", value: (r) => formatCents(r.aggregates?.outstandingBalanceCents ?? 0) },
    { header: "Invoice Count", value: (r) => String(r.aggregates?.invoiceCount ?? 0) },
    { header: "Status", value: (r) => (r.client.archivedAt ? "Archived" : "Active") },
    { header: "Created", value: (r) => r.client.createdAt.toISOString() },
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
    requirePermission(auth, "canManageClients");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get("includeArchived") === "true";

  const clients = await prisma.client.findMany({
    where: { churchId: auth.churchId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { displayName: "asc" },
  });
  const aggregates = await loadClientAggregatesBatch(clients.map((c) => c.id));

  const rows: ClientExportRow[] = clients.map((client) => ({ client, aggregates: aggregates.get(client.id) }));
  const csv = buildCsvExport(rows, columns());

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "client.exported",
    entityType: "client",
    metadata: { rowCount: rows.length, includeArchived },
    req,
  });

  return csvResponse(csv, "clients.csv");
}
