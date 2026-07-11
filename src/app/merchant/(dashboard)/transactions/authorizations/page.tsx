import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import AuthorizationDetailPanel from "@/components/merchant/AuthorizationDetailPanel";
import AuthorizationFilterBar from "@/components/merchant/AuthorizationFilterBar";
import { PinButton } from "@/components/merchant/PaymentDetailActions";
import { resolveAuthorizationEffectiveStatus, isAuthorizationCaptured } from "@/lib/finix/authorizationStatus";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";

const STATES = ["CAPTURED", "SUCCEEDED", "VOIDED", "EXPIRED", "PENDING", "FAILED"];

export default async function AuthorizationsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    range?: string;
    from?: string;
    to?: string;
    buyer?: string;
    last4?: string;
    org?: string;
    captured?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to, buyer, last4, org, captured, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  // Effective-status filters (CAPTURED/VOIDED/EXPIRED) are derived, not
  // stored directly — translate them into the underlying DB predicates the
  // resolver relies on, rather than filtering the raw `state` column.
  const isCapturedFilter = state === "CAPTURED";
  const isVoidedFilter = state === "VOIDED";
  const isExpiredFilter = state === "EXPIRED";
  const isRawStateFilter = state && !isCapturedFilter && !isVoidedFilter && !isExpiredFilter;

  const authorizations = await prisma.finixAuthorization.findMany({
    where: {
      churchId,
      ...(isRawStateFilter ? { state } : {}),
      ...(isVoidedFilter ? { isVoid: true, finixTransferId: null } : {}),
      ...(isExpiredFilter ? { expiresAt: { lt: new Date() }, isVoid: { not: true }, finixTransferId: null } : {}),
      ...(isCapturedFilter ? { finixTransferId: { not: null } } : {}),
      ...(captured === "true" && !isCapturedFilter ? { finixTransferId: { not: null } } : {}),
      ...(captured === "false" && !isCapturedFilter ? { finixTransferId: null } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 200,
  });

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const directInstrumentIds = authorizations
    .map((a) => a.finixPaymentInstrumentId)
    .filter((iid): iid is string => Boolean(iid));

  const transferIds = authorizations
    .map((a) => a.finixTransferId)
    .filter((tid): tid is string => Boolean(tid));

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

  // Fallback: older records synced before finixPaymentInstrumentId was
  // stored directly on the authorization — resolve via the linked transfer.
  const fallbackInstrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((iid): iid is string => Boolean(iid) && !instrumentMap.has(iid as string));
  if (fallbackInstrumentIds.length) {
    const fallbacks = await prisma.finixPaymentInstrumentSnapshot.findMany({
      where: { finixPaymentInstrumentId: { in: fallbackInstrumentIds } },
    });
    for (const i of fallbacks) instrumentMap.set(i.finixPaymentInstrumentId, i);
  }
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const donorIds = [...instrumentMap.values()]
    .map((i) => i.donorId)
    .filter((did): did is string => Boolean(did));
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

  // Donor name and organization name filters run in memory — the result
  // set is already narrowed to <=200 rows for this church by the query above.
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
    if (org) {
      const orgName = church?.name || "";
      if (!orgName.toLowerCase().includes(org.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Authorizations</h2>
        <PinButton />
      </div>

      <AuthorizationFilterBar
        states={STATES}
        exportHref="/api/merchant/transactions/authorizations/export"
        syncHref="/api/merchant/transactions/authorizations/sync"
      />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No authorizations match these filters. Use "Sync Authorizations" above to import the latest records.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Organization</th>
                  <th className="px-6 py-3">Donor</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">State</th>
                  <th className="px-6 py-3">Payment Instrument</th>
                  <th className="px-6 py-3">Instrument Type</th>
                  <th className="px-6 py-3">Captured Status</th>
                  <th className="px-6 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const instrument = resolveInstrument(a);
                  const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
                  const effectiveStatus = resolveAuthorizationEffectiveStatus(a);
                  const captured = isAuthorizationCaptured(a);
                  const isSelected = id === a.finixAuthorizationId;

                  return (
                    <ClickableTableRow
                      key={a.id}
                      id={a.finixAuthorizationId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={a.finixAuthorizationId} />
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {formatDateTime(a.createdAtFinix)}
                      </td>
                      <td className="px-6 py-3 text-slate-700">{church?.name || "—"}</td>
                      <td className="px-6 py-3 text-slate-700">
                        {formatPersonName(donor?.name, instrument?.accountHolderName)}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">
                        {formatCents(a.amountCents ?? 0)}
                      </td>
                      <td className="px-6 py-3">
                        <StateBadge state={effectiveStatus} />
                        {a.failureCode && (
                          <p className="text-xs text-slate-400 mt-0.5">{a.failureCode}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {instrument
                          ? `${instrument.cardBrand || "Bank"} •••• ${instrument.cardLast4 || instrument.bankLast4 || "----"}`
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {instrument?.paymentMethodType === "BANK_ACCOUNT" || instrument?.bankLast4
                          ? "Bank Account"
                          : instrument
                          ? "Card"
                          : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            captured ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {captured ? "Captured" : "Not Captured"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatDateTime(a.updatedAtFinix)}
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {id && <AuthorizationDetailPanel authorizationId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
