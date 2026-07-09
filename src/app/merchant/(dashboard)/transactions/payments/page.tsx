import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import PaymentsFilterBar from "@/components/merchant/PaymentsFilterBar";
import PaymentsHeaderActions from "@/components/merchant/PaymentsHeaderActions";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import PaymentDetailPanel from "@/components/merchant/PaymentDetailPanel";
import { resolveDateRange } from "@/lib/dateRangePresets";

export default async function PaymentsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    last4?: string;
    buyer?: string;
    range?: string;
    from?: string;
    to?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, last4, buyer, range, from, to, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      // subtype is null for most transfers (only bank returns set it) —
      // NOT: { subtype: { contains: "RETURN" } } alone would silently
      // exclude every null-subtype row too, since SQL's NOT NULL is NULL,
      // not TRUE. OR-ing in the null case keeps the exclusion working.
      OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
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
        where: { finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" },
      })
    : [];
  const refundedCentsByTransfer = new Map<string, number>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    refundedCentsByTransfer.set(
      r.finixOriginalTransferId,
      (refundedCentsByTransfer.get(r.finixOriginalTransferId) ?? 0) + (r.amountCents ?? 0)
    );
  }

  const rows = transfers
    .map((t) => {
      const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
      const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : undefined;
      return { transfer: t, instrument, donor };
    })
    .filter(({ instrument, donor }) => {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900">Payments</h2>
        <PaymentsHeaderActions />
      </div>

      <PaymentsFilterBar />

      <div className="flex items-start gap-6">
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No payments match these filters.
          </p>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Donor</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Payment Instrument</th>
                <th className="px-6 py-3">Instrument Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ transfer: t, instrument, donor }) => {
                const last4Value = instrument?.cardLast4 || instrument?.bankLast4;
                const instrumentLabel = instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : null);
                const isSucceeded = (t.state || "").toUpperCase() === "SUCCEEDED";
                const isFailed = (t.state || "").toUpperCase() === "FAILED";
                const refundedCents = refundedCentsByTransfer.get(t.finixTransferId) ?? 0;
                const isFullyRefunded = refundedCents > 0 && refundedCents >= (t.amountCents ?? 0);
                const isPartiallyRefunded = refundedCents > 0 && !isFullyRefunded;

                return (
                  <ClickableTableRow
                    key={t.id}
                    id={t.finixTransferId}
                    className={`border-t border-slate-50 hover:bg-slate-50 ${
                      id === t.finixTransferId ? "bg-slate-50" : ""
                    }`}
                  >
                    <td className="px-6 py-3">
                      <CopyableIdBadge id={t.finixTransferId} />
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {t.createdAtFinix
                        ? new Date(t.createdAtFinix).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {donor?.name || instrument?.accountHolderName || "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(t.amountCents ?? 0)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isSucceeded
                            ? "bg-green-50 text-green-700"
                            : isFailed
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t.state || "UNKNOWN"}
                      </span>
                      {(isFullyRefunded || isPartiallyRefunded) && (
                        <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                          {isFullyRefunded ? "Refunded" : "Partially Refunded"}
                        </span>
                      )}
                      {isFailed && t.failureCode && (
                        <p className="text-xs text-slate-400 mt-0.5">{t.failureCode}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {last4Value ? `••••${last4Value}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{instrumentLabel || "Unknown"}</td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {id && <PaymentDetailPanel transferId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
