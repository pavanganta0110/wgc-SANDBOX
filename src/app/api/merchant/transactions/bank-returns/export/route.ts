import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatAchReturnReason } from "@/lib/finix/achReturnReasonCodes";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { resolveScopedTransferIds } from "@/lib/reports/insightsData";
import { isAuthError } from "@/lib/auth/errors";

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

  // Team-access Checkpoint 4A: same policy as the bank-returns page —
  // no row-level attribution exists for ACH returns yet, so FUNDRAISER/VIEWER
  // are denied entirely rather than shown organization-wide data.
  if (!getSettlementPermissions(auth.rawRole).canExport) {
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

  // Team-access: OWNER/authorized ADMIN may narrow this export to a
  // specific team member's attributed activity via the dashboard scope
  // dropdown ("view as") — this does not loosen the FUNDRAISER/VIEWER
  // denial above, it only narrows what an already-authorized org-wide
  // export contains.
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;
  const scopedTransferIds = await resolveScopedTransferIds(auth.churchId, scopedUserId);

  const returns = await prisma.bankReturn.findMany({
    where: {
      churchId: auth.churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { originalTransferId: { in: scopedTransferIds } } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });

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
