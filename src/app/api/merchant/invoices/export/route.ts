import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";

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

  const header = [
    "Invoice Number",
    "Status",
    "Client",
    "Client Email",
    "Classification",
    "Issue Date",
    "Due Date",
    "Subtotal",
    "Discount",
    "Tax",
    "Total",
    "Paid",
    "Refunded",
    "Balance",
    "Created By",
    "Created",
  ];
  const lines = [header.join(",")];

  for (const inv of invoices) {
    const client = clientById.get(inv.clientId);
    lines.push(
      [
        csvEscape(inv.invoiceNumber),
        csvEscape(inv.status),
        csvEscape(client?.displayName || ""),
        csvEscape(client?.email || ""),
        csvEscape(inv.classification),
        csvEscape(inv.issueDate.toISOString().slice(0, 10)),
        csvEscape(inv.dueDate.toISOString().slice(0, 10)),
        csvEscape(formatCents(inv.subtotalCents)),
        csvEscape(formatCents(inv.discountCents)),
        csvEscape(formatCents(inv.taxCents)),
        csvEscape(formatCents(inv.totalCents)),
        csvEscape(formatCents(inv.amountPaidCents)),
        csvEscape(formatCents(inv.refundedCents)),
        csvEscape(formatCents(inv.balanceCents)),
        csvEscape(inv.createdByEmail || ""),
        csvEscape(inv.createdAt.toISOString()),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invoices.csv"`,
    },
  });
}
