import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatAchReturnReason } from "@/lib/finix/achReturnReasonCodes";

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
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const last4 = searchParams.get("last4") || undefined;
  const buyerFilter = searchParams.get("buyer") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const returns = await prisma.bankReturn.findMany({
    where: {
      churchId: session.churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  const instrumentIds = returns
    .map((r) => r.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const buyerIds = returns.map((r) => r.buyerId).filter((id): id is string => Boolean(id));
  const donors = buyerIds.length
    ? await prisma.donor.findMany({ where: { id: { in: buyerIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const rows = returns.filter((r) => {
    const instrument = r.finixPaymentInstrumentId ? instrumentMap.get(r.finixPaymentInstrumentId) : null;
    const donor = r.buyerId ? donorMap.get(r.buyerId) : null;
    if (last4 && instrument?.bankLast4 !== last4) return false;
    if (buyerFilter) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(buyerFilter.toLowerCase())) return false;
    }
    return true;
  });

  const header = [
    "ID",
    "Created",
    "Organization",
    "Buyer",
    "Buyer Email",
    "Amount",
    "Payment Instrument",
    "Reason Code",
    "Reason Description",
    "Original Payment ID",
    "Updated",
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
    const instrument = r.finixPaymentInstrumentId ? instrumentMap.get(r.finixPaymentInstrumentId) : null;
    const donor = r.buyerId ? donorMap.get(r.buyerId) : null;

    lines.push(
      [
        csvEscape(r.bankReturnId),
        csvEscape(r.createdAtFinix ? r.createdAtFinix.toISOString() : ""),
        csvEscape(church?.name || ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(donor?.email || ""),
        csvEscape(formatCents(r.amountCents ?? 0)),
        csvEscape(instrument?.bankLast4 ? `Bank ${instrument.bankLast4}` : ""),
        csvEscape(r.reasonCode || ""),
        csvEscape(formatAchReturnReason(r.reasonCode)),
        csvEscape(r.originalTransferId || ""),
        csvEscape(r.updatedAtFinix ? r.updatedAtFinix.toISOString() : ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bank-returns.csv"`,
    },
  });
}
