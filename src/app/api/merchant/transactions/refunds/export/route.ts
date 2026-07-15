import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { formatPersonName } from "@/lib/formatPersonName";
import { computeRefundStatus } from "@/lib/finix/refundStatus";

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
  const donorFilter = searchParams.get("donor") || undefined;
  const last4 = searchParams.get("last4") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const refunds = await prisma.finixRefundOrReversal.findMany({
    where: {
      churchId: session.churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  const originalTransferIds = refunds
    .map((r) => r.finixOriginalTransferId)
    .filter((id): id is string => Boolean(id));
  const transfers = originalTransferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: originalTransferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map((i) => i.donorId).filter((id): id is string => Boolean(id));
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const allRefundsByTransfer = new Map<string, typeof refunds>();
  if (originalTransferIds.length) {
    const allRelated = await prisma.finixRefundOrReversal.findMany({
      where: { finixOriginalTransferId: { in: originalTransferIds } },
    });
    for (const r of allRelated) {
      if (!r.finixOriginalTransferId) continue;
      const list = allRefundsByTransfer.get(r.finixOriginalTransferId) ?? [];
      list.push(r);
      allRefundsByTransfer.set(r.finixOriginalTransferId, list);
    }
  }

  const rows = refunds.filter((r) => {
    const transfer = r.finixOriginalTransferId ? transferMap.get(r.finixOriginalTransferId) : null;
    const instrument = transfer?.finixPaymentInstrumentId ? instrumentMap.get(transfer.finixPaymentInstrumentId) : null;
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
    if (last4) {
      const l4 = instrument?.cardLast4 || instrument?.bankLast4;
      if (l4 !== last4) return false;
    }
    if (donorFilter) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(donorFilter.toLowerCase())) return false;
    }
    return true;
  });

  const header = [
    "ID",
    "Created",
    "Organization",
    "Donor",
    "Donor Email",
    "Refund Amount",
    "State",
    "Refund Type",
    "Original Payment ID",
    "Original Amount",
    "Payment Instrument",
    "Instrument Type",
    "Updated",
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
    const transfer = r.finixOriginalTransferId ? transferMap.get(r.finixOriginalTransferId) : null;
    const instrument = transfer?.finixPaymentInstrumentId ? instrumentMap.get(transfer.finixPaymentInstrumentId) : null;
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
    const rState = (r.state || "").toUpperCase();
    const aggregate = transfer
      ? computeRefundStatus(transfer, allRefundsByTransfer.get(transfer.finixTransferId) ?? [r])
      : null;
    const refundType =
      rState === "SUCCEEDED"
        ? aggregate?.refundStatus === "FULL"
          ? "Full Refund"
          : aggregate?.refundStatus === "PARTIAL"
            ? "Partial Refund"
            : ""
        : "";

    lines.push(
      [
        csvEscape(r.finixReversalId),
        csvEscape(r.createdAtFinix ? r.createdAtFinix.toISOString() : ""),
        csvEscape(church?.name || ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(donor?.email || ""),
        csvEscape(formatCents(r.amountCents ?? 0)),
        csvEscape(rState || "UNKNOWN"),
        csvEscape(refundType),
        csvEscape(r.finixOriginalTransferId || ""),
        csvEscape(formatCents(transfer?.amountCents ?? 0)),
        csvEscape(
          instrument
            ? `${instrument.cardBrand || "Bank"} ${instrument.cardLast4 || instrument.bankLast4 || ""}`.trim()
            : ""
        ),
        csvEscape(instrument?.bankLast4 ? "Bank Account" : instrument ? "Card" : ""),
        csvEscape(r.updatedAtFinix ? r.updatedAtFinix.toISOString() : ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="refunds.csv"`,
    },
  });
}
