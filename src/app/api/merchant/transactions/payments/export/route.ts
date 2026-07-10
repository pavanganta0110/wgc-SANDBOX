import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { computeRefundStatus, resolveDisplayStatus } from "@/lib/finix/refundStatus";
import { formatPersonName } from "@/lib/formatPersonName";

const REFUND_DERIVED_STATES = new Set(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"]);

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
  const last4 = searchParams.get("last4") || undefined;
  const buyer = searchParams.get("buyer") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const isRefundDerivedFilter = state ? REFUND_DERIVED_STATES.has(state) : false;

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId: session.churchId,
      // See the same OR-in-null fix in transactions/payments/page.tsx —
      // NOT: { subtype: { contains: "RETURN" } } alone excludes every
      // null-subtype row too under SQL's three-valued logic.
      OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
      ...(state && !isRefundDerivedFilter ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const instrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map((i) => i.donorId).filter((did): did is string => Boolean(did));
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const transferIds = transfers.map((t) => t.finixTransferId);
  const refunds = transferIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { finixOriginalTransferId: { in: transferIds } },
      })
    : [];
  const refundsByTransfer = new Map<string, typeof refunds>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    const list = refundsByTransfer.get(r.finixOriginalTransferId) ?? [];
    list.push(r);
    refundsByTransfer.set(r.finixOriginalTransferId, list);
  }

  const rows = transfers
    .map((t) => ({
      transfer: t,
      refund: computeRefundStatus(t, refundsByTransfer.get(t.finixTransferId) ?? []),
    }))
    .filter(({ transfer: t, refund }) => {
      const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
      const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : undefined;
      if (last4) {
        const l4 = instrument?.cardLast4 || instrument?.bankLast4;
        if (l4 !== last4) return false;
      }
      if (buyer) {
        const name = donor?.name || instrument?.accountHolderName || "";
        if (!name.toLowerCase().includes(buyer.toLowerCase())) return false;
      }
      if (isRefundDerivedFilter && resolveDisplayStatus(t.state, refund) !== state) return false;
      return true;
    });

  const header = [
    "ID",
    "Created",
    "Donor",
    "Email",
    "Phone",
    "Amount",
    "State",
    "Refund Status",
    "Net Amount",
    "Display Status",
    "Instrument Type",
    "Last Four",
  ];
  const lines = [header.join(",")];

  for (const { transfer: t, refund } of rows) {
    const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : undefined;
    lines.push(
      [
        csvEscape(t.finixTransferId),
        csvEscape(t.createdAtFinix ? t.createdAtFinix.toISOString() : ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(donor?.email || ""),
        csvEscape(donor?.phone || ""),
        csvEscape(formatCents(t.amountCents ?? 0)),
        csvEscape(t.state || "UNKNOWN"),
        csvEscape(refund.refundStatus),
        csvEscape(formatCents(refund.netAmountCents)),
        csvEscape(resolveDisplayStatus(t.state, refund)),
        csvEscape(instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "Unknown")),
        csvEscape(instrument?.cardLast4 || instrument?.bankLast4 || ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payments.csv"`,
    },
  });
}
