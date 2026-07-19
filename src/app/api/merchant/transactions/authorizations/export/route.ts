import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveAuthorizationEffectiveStatus, isAuthorizationCaptured } from "@/lib/finix/authorizationStatus";
import { getAuthorizationPermissions } from "@/lib/finix/authorizationPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
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
  // Team-access Checkpoint 4C: FinixAuthorization has no attribution field
  // and voided/expired authorizations can't be bridged to a Payment at
  // all — per the approved fallback policy, this stays organization-scope
  // only (OWNER always, ADMIN per canViewSettlements), FUNDRAISER/VIEWER
  // denied entirely rather than exposing unscoped organization-wide data.
  const permissions = getAuthorizationPermissions(auth.rawRole);
  if (!permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const buyer = searchParams.get("buyer") || undefined;
  const last4 = searchParams.get("last4") || undefined;
  const captured = searchParams.get("captured") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const isCapturedFilter = state === "CAPTURED";
  const isVoidedFilter = state === "VOIDED";
  const isExpiredFilter = state === "EXPIRED";
  const isRawStateFilter = state && !isCapturedFilter && !isVoidedFilter && !isExpiredFilter;

  const authorizations = await prisma.finixAuthorization.findMany({
    where: {
      churchId: auth.churchId,
      ...(isRawStateFilter ? { state } : {}),
      ...(isVoidedFilter ? { isVoid: true, finixTransferId: null } : {}),
      ...(isExpiredFilter ? { expiresAt: { lt: new Date() }, isVoid: { not: true }, finixTransferId: null } : {}),
      ...(isCapturedFilter ? { finixTransferId: { not: null } } : {}),
      ...(captured === "true" && !isCapturedFilter ? { finixTransferId: { not: null } } : {}),
      ...(captured === "false" && !isCapturedFilter ? { finixTransferId: null } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });

  const directInstrumentIds = authorizations
    .map((a) => a.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const transferIds = authorizations
    .map((a) => a.finixTransferId)
    .filter((id): id is string => Boolean(id));

  const [directInstruments, transfers] = await Promise.all([
    directInstrumentIds.length
      ? prisma.finixPaymentInstrumentSnapshot.findMany({
          where: { finixPaymentInstrumentId: { in: directInstrumentIds } },
        })
      : [],
    transferIds.length
      ? prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
      : [],
  ]);
  const instrumentMap = new Map(directInstruments.map((i) => [i.finixPaymentInstrumentId, i]));
  const fallbackIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id) && !instrumentMap.has(id as string));
  if (fallbackIds.length) {
    const fallbacks = await prisma.finixPaymentInstrumentSnapshot.findMany({
      where: { finixPaymentInstrumentId: { in: fallbackIds } },
    });
    for (const i of fallbacks) instrumentMap.set(i.finixPaymentInstrumentId, i);
  }
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const donorIds = [...instrumentMap.values()]
    .map((i) => i.donorId)
    .filter((id): id is string => Boolean(id));
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  function resolveInstrument(a: (typeof authorizations)[number]) {
    if (a.finixPaymentInstrumentId) return instrumentMap.get(a.finixPaymentInstrumentId) ?? null;
    if (a.finixTransferId) {
      const t = transferMap.get(a.finixTransferId);
      if (t?.finixPaymentInstrumentId) return instrumentMap.get(t.finixPaymentInstrumentId) ?? null;
    }
    return null;
  }

  const rows = authorizations.filter((a) => {
    const instrument = resolveInstrument(a);
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
    if (last4) {
      const l4 = instrument?.cardLast4 || instrument?.bankLast4;
      if (l4 !== last4) return false;
    }
    if (buyer) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(buyer.toLowerCase())) return false;
    }
    return true;
  });

  const header = [
    "ID",
    "Created",
    "Organization",
    "Donor",
    "Amount",
    "State",
    "Payment Instrument",
    "Instrument Type",
    "Captured Status",
    "Updated",
  ];
  const lines = [header.join(",")];

  for (const a of rows) {
    const instrument = resolveInstrument(a);
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
    const effectiveStatus = resolveAuthorizationEffectiveStatus(a);
    const captured = isAuthorizationCaptured(a);

    lines.push(
      [
        csvEscape(a.finixAuthorizationId),
        csvEscape(a.createdAtFinix ? a.createdAtFinix.toISOString() : ""),
        csvEscape(church?.name || ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(formatCents(a.amountCents ?? 0)),
        csvEscape(effectiveStatus),
        csvEscape(
          instrument
            ? `${instrument.cardBrand || "Bank"} ${instrument.cardLast4 || instrument.bankLast4 || ""}`.trim()
            : ""
        ),
        csvEscape(
          instrument?.paymentMethodType === "BANK_ACCOUNT" || instrument?.bankLast4
            ? "Bank Account"
            : instrument
            ? "Card"
            : ""
        ),
        csvEscape(captured ? "Captured" : "Not Captured"),
        csvEscape(a.updatedAtFinix ? a.updatedAtFinix.toISOString() : ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="authorizations.csv"`,
    },
  });
}
