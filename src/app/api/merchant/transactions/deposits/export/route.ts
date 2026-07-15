import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { formatFundingSpeed } from "@/lib/depositColumns";

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
  const state = searchParams.get("state") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const deposits = await prisma.finixFundingTransferAttempt.findMany({
    where: {
      churchId: session.churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  const header = [
    "ID",
    "Created",
    "Organization",
    "Deposit Amount",
    "Bank Account",
    "Deposit State",
    "Funding Speed",
    "Settlement Count",
    "Payment Count",
    "Net Amount",
    "Expected Deposit Date",
    "Actual Deposit Date",
    "Trace/Reference",
    "Updated",
  ];
  const lines = [header.join(",")];

  for (const d of deposits) {
    lines.push(
      [
        csvEscape(d.finixFundingTransferAttemptId),
        csvEscape(d.createdAtFinix ? d.createdAtFinix.toISOString() : ""),
        csvEscape(church?.name || ""),
        csvEscape(formatCents(d.amountCents ?? 0)),
        csvEscape(d.bankAccountLast4 ? `${d.bankName || "Bank"} ••••${d.bankAccountLast4}` : ""),
        csvEscape(d.state || "UNKNOWN"),
        csvEscape(formatFundingSpeed(d.fundingSpeed)),
        csvEscape(String(d.settlementCount ?? (d.finixSettlementId ? 1 : 0))),
        csvEscape(String(d.paymentCount ?? "")),
        csvEscape(formatCents(d.netAmountCents ?? d.amountCents ?? 0)),
        csvEscape(d.estimatedArrivalDate ? d.estimatedArrivalDate.toISOString() : ""),
        csvEscape(d.arrivedAt ? d.arrivedAt.toISOString() : ""),
        csvEscape(d.traceId || ""),
        csvEscape(d.updatedAtFinix ? d.updatedAtFinix.toISOString() : ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="deposits.csv"`,
    },
  });
}
