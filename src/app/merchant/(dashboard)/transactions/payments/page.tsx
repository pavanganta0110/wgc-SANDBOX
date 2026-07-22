import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope, buildPaymentScope } from "@/lib/auth/scopes";
import PaymentsFilterBar from "@/components/merchant/PaymentsFilterBar";
import PaymentsHeaderActions from "@/components/merchant/PaymentsHeaderActions";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import PaymentDetailPanel from "@/components/merchant/PaymentDetailPanel";
import StateBadge from "@/components/merchant/StateBadge";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { computeRefundStatus, resolveDisplayStatus } from "@/lib/finix/refundStatus";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { reconcilePendingPayments } from "@/lib/finix/sync/paymentReconciliation";
import { resolveFundFilteredTransferIds } from "@/lib/giving/fundAssignment";

const REFUND_DERIVED_STATES = new Set(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"]);

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
    fund?: string;
  }>;
}) {
  const auth = await requireMerchantSession();
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  // Team-access Checkpoint 4A: FinixTransfer has no attribution column of
  // its own — buildFinixTransferScope bridges through Payment.attributedUserId
  // (see that helper's comment). Organization scope still includes
  // unattributed transfers, matching the approved payment-scope policy.
  const transferScope = await buildFinixTransferScope(auth, viewScope);
  const { state, last4, buyer, range, from, to, id, fund } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  const pricing = await prisma.churchPricing.findUnique({ where: { churchId } });

  // Typeahead suggestions only — current catalog names plus any distinct
  // historical Payment.fundName snapshots (covers renamed/archived funds
  // whose old name no longer appears in the live Fund catalog). Scoped to
  // the church only; the actual filter below is what enforces view scope.
  const [catalogFunds, historicalFundNames] = await Promise.all([
    prisma.fund.findMany({ where: { churchId }, orderBy: { displayOrder: "asc" }, select: { name: true } }),
    prisma.payment.findMany({ where: { churchId, fundName: { not: null } }, distinct: ["fundName"], select: { fundName: true }, take: 200 }),
  ]);
  const fundSuggestions = [...new Set([...catalogFunds.map((f) => f.name), ...historicalFundNames.map((p) => p.fundName as string)])].sort();

  // Refund-derived states (REFUNDED, etc.) aren't a real value of the
  // transfer's own `state` column — the underlying charge state stays
  // SUCCEEDED even after a full refund. Those get filtered in-memory below
  // instead of at the DB level.
  const isRefundDerivedFilter = state ? REFUND_DERIVED_STATES.has(state) : false;

  // Self-healing fallback for missed/delayed transfer.updated webhooks —
  // bounded and throttled (see paymentReconciliation.ts), so a payment
  // stuck showing PENDING is corrected on the next page view instead of
  // needing a redeploy or manual intervention.
  const { after } = require("next/server");
  after(async () => {
    try {
      await reconcilePendingPayments(churchId);
    } catch (err) {
      console.error("Pending-payment reconciliation pass failed:", err);
    }
  });

  // Fund / Designation filter is resolved server-side against the
  // Payment.fundName snapshot (never the live Fund catalog, so a renamed
  // or archived fund still matches its historical transactions) and scoped
  // through buildPaymentScope — the same organization/team-member/
  // fundraiser attribution rules as every other view here, derived only
  // from the authenticated session, never a client-supplied value.
  const fundMatchedTransferIds = fund
    ? await resolveFundFilteredTransferIds(buildPaymentScope(auth, viewScope), fund)
    : null;

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      ...transferScope,
      // subtype is null for most transfers (only bank returns set it) —
      // NOT: { subtype: { contains: "RETURN" } } alone would silently
      // exclude every null-subtype row too, since SQL's NOT NULL is NULL,
      // not TRUE. OR-ing in the null case keeps the exclusion working.
      OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
      ...(state && !isRefundDerivedFilter ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(fundMatchedTransferIds ? { finixTransferId: { in: fundMatchedTransferIds } } : {}),
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

  const payments = transferIds.length
    ? await prisma.payment.findMany({
        where: { churchId, finixTransferId: { in: transferIds } },
        select: { finixTransferId: true, fundName: true },
      })
    : [];
  const paymentByTransfer = new Map(payments.filter((p) => p.finixTransferId).map((p) => [p.finixTransferId as string, p]));

  const rows = transfers
    .map((t) => {
      const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
      const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : undefined;
      const refund = computeRefundStatus(t, refundsByTransfer.get(t.finixTransferId) ?? []);
      const displayStatus = resolveDisplayStatus(t.state, refund);
      const payment = paymentByTransfer.get(t.finixTransferId);
      return { transfer: t, instrument, donor, refund, displayStatus, payment };
    })
    .filter(({ instrument, donor, displayStatus }) => {
      if (last4) {
        const l4 = instrument?.cardLast4 || instrument?.bankLast4;
        if (l4 !== last4) return false;
      }
      if (buyer) {
        const name = donor?.name || instrument?.accountHolderName || "";
        if (!name.toLowerCase().includes(buyer.toLowerCase())) return false;
      }
      if (isRefundDerivedFilter && displayStatus !== state) return false;
      // Fund filtering already happened server-side above (fundMatchedTransferIds).
      return true;
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900">Payments</h2>
        <PaymentsHeaderActions
          finixMerchantId={church?.finixMerchantId || ""}
          churchName={church?.name || ""}
          pricing={{
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          }}
        />
      </div>

      <PaymentsFilterBar fundSuggestions={fundSuggestions} />

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
                <th className="px-6 py-3">Fund</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ transfer: t, instrument, donor, refund, displayStatus, payment }) => {
                const last4Value = instrument?.cardLast4 || instrument?.bankLast4;
                const instrumentLabel = instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : null);
                const isFailed = (t.state || "").toUpperCase() === "FAILED";

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
                      {formatDateTimeCDT(t.createdAtFinix)}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {formatPersonName(donor?.name, instrument?.accountHolderName)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(t.amountCents ?? 0)}
                      {refund.refundStatus !== "NONE" && refund.refundStatus !== "PENDING" && (
                        <p className="text-xs font-normal text-slate-400">
                          Net {formatCents(refund.netAmountCents)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StateBadge state={displayStatus} />
                      {isFailed && t.failureCode && (
                        <p className="text-xs text-slate-400 mt-0.5">{t.failureCode}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {last4Value ? `••••${last4Value}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{instrumentLabel || "Unknown"}</td>
                    <td className="px-6 py-3 text-slate-600">{payment?.fundName || "Unspecified"}</td>
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
