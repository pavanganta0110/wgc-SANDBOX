import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { loadClientAggregatesBatch } from "@/lib/clients/clientsList";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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

  const header = [
    "Name",
    "Type",
    "Email",
    "Phone",
    "Billing Address",
    "Total Invoiced",
    "Total Paid",
    "Outstanding Balance",
    "Invoice Count",
    "Status",
    "Created",
  ];
  const lines = [header.join(",")];

  for (const client of clients) {
    const agg = aggregates.get(client.id);
    const address = [client.billingAddressLine1, client.billingCity, client.billingState, client.billingPostalCode].filter(Boolean).join(", ");
    lines.push(
      [
        csvEscape(client.displayName),
        csvEscape(client.clientType),
        csvEscape(client.email || ""),
        csvEscape(client.phone || ""),
        csvEscape(address),
        csvEscape(formatCents(agg?.totalInvoicedCents ?? 0)),
        csvEscape(formatCents(agg?.totalPaidCents ?? 0)),
        csvEscape(formatCents(agg?.outstandingBalanceCents ?? 0)),
        csvEscape(String(agg?.invoiceCount ?? 0)),
        csvEscape(client.archivedAt ? "Archived" : "Active"),
        csvEscape(client.createdAt.toISOString()),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="clients.csv"`,
    },
  });
}
