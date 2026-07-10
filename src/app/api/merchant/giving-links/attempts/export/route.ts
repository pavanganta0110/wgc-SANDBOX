import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { loadGivingLinkAttempts } from "@/lib/givingLinks/attempts";
import { resolveDateRange } from "@/lib/dateRangePresets";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const givingLinkId = searchParams.get("givingLinkId") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const rows = await loadGivingLinkAttempts(session.churchId, { givingLinkId, dateFilter, take: 5000 });

  const header = [
    "Attempt ID",
    "Giving Link",
    "Donor",
    "Email",
    "Amount",
    "Fee",
    "Total",
    "State",
    "Payment Method",
    "Last Four",
    "Created",
    "Updated",
    "Transfer ID",
    "Fund/Campaign",
  ];
  const lines = [header.join(",")];

  for (const { payment, givingLink, transfer, instrument, donor } of rows) {
    lines.push(
      [
        csvEscape(payment.id),
        csvEscape(givingLink?.internalName || ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(donor?.email || ""),
        csvEscape(formatCents(payment.donationAmountCents ?? payment.amountCents)),
        csvEscape(formatCents(payment.feeCoveredCents ?? 0)),
        csvEscape(formatCents(payment.amountCents)),
        csvEscape((transfer?.state || payment.status || "").toUpperCase()),
        csvEscape(payment.paymentMethodType || ""),
        csvEscape(instrument?.cardLast4 || instrument?.bankLast4 || ""),
        csvEscape(payment.createdAt.toISOString()),
        csvEscape(payment.updatedAt.toISOString()),
        csvEscape(payment.finixTransferId || ""),
        csvEscape(payment.fundName || ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="donation-attempts.csv"`,
    },
  });
}
