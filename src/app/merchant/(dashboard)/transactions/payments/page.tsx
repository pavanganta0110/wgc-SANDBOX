import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope, buildPaymentScope } from "@/lib/auth/scopes";
import PaymentsFilterBar from "@/components/merchant/PaymentsFilterBar";
import PaymentsHeaderActions from "@/components/merchant/PaymentsHeaderActions";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import { Printer } from "lucide-react";
import PaymentDetailPanel from "@/components/merchant/PaymentDetailPanel";
import StateBadge from "@/components/merchant/StateBadge";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { computeRefundStatus, resolveDisplayStatus } from "@/lib/finix/refundStatus";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { reconcilePendingPayments } from "@/lib/finix/sync/paymentReconciliation";
import { resolveFundFilteredTransferIds } from "@/lib/giving/fundAssignment";
import { getRevenueBySource, buildSourceClassifier, SOURCE_KEYS, SOURCE_LABELS, type RevenueSourceKey } from "@/lib/reporting/revenueBySource";
import { PaymentInstrumentCell, InstrumentTypeCell } from "@/components/merchant/PaymentInstrumentDisplay";
import { intersectIdSets, normalizeSearchQuery, resolveSearchMatchedTransferIds } from "@/lib/payments/search";
import { modeLabel } from "@/lib/settings/paymentMode";
import { getPaymentWording } from "@/lib/settings/paymentWording";

const REFUND_DERIVED_STATES = new Set(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"]);

export default async function PaymentsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    last4?: string;
    buyer?: string;
    q?: string;
    range?: string;
    from?: string;
    to?: string;
    id?: string;
    fund?: string;
    source?: string;
    takePayment?: string;
  }>;
}) {
  const { pw } = await getPaymentWording();
  const auth = await requireMerchantSession();
  const churchId = auth.churchId;
  const viewScope = await resolveViewScope(auth);
  // Team-access Checkpoint 4A: FinixTransfer has no attribution column of
  // its own — buildFinixTransferScope bridges through Payment.attributedUserId
  // (see that helper's comment). Organization scope still includes
  // unattributed transfers, matching the approved payment-scope policy.
  const transferScope = await buildFinixTransferScope(auth, viewScope);
  const { state, last4, buyer, q, range, from, to, id, fund, source, takePayment } = await searchParams;
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

  const paymentScope = buildPaymentScope(auth, viewScope);
  const [revenueBySource, classifySource] = await Promise.all([
    getRevenueBySource(paymentScope, churchId, dateFilter),
    buildSourceClassifier(churchId),
  ]);

  // Source filter: resolve the matching transfer ids server-side (same
  // scope as the table) and intersect with the fund filter if both are set.
  const sourceFilter = SOURCE_KEYS.includes(source as RevenueSourceKey) ? (source as RevenueSourceKey) : null;
  let sourceMatchedTransferIds: string[] | null = null;
  if (sourceFilter) {
    const scoped = await prisma.payment.findMany({
      where: { ...paymentScope, finixTransferId: { not: null } },
      select: { id: true, givingLinkId: true, finixTransferId: true },
    });
    sourceMatchedTransferIds = scoped
      .filter((p) => classifySource(p) === sourceFilter)
      .map((p) => p.finixTransferId as string);
  }

  // Free-text search (payer, student ID/name, amount, note, term, transaction id), resolved server-side against the
  // same scopes as the table and intersected with the other id-based filters below.
  const searchQuery = normalizeSearchQuery(q);
  const searchMatchedTransferIds = searchQuery
    ? await resolveSearchMatchedTransferIds({ churchId, paymentScope, transferScope, query: searchQuery })
    : null;
  const idFilter = intersectIdSets([fundMatchedTransferIds, sourceMatchedTransferIds, searchMatchedTransferIds]);

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      ...transferScope,
      AND: [
        { OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }] },
      ],
      ...(state && !isRefundDerivedFilter ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(idFilter ? { finixTransferId: { in: idFilter } } : {}),
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
        select: { id: true, givingLinkId: true, finixTransferId: true, fundName: true, note: true, studentId: true, studentTermLabel: true },
      })
    : [];
  const studentIds = [...new Set(payments.map((p) => p.studentId).filter((sid): sid is string => Boolean(sid)))];
  const students = studentIds.length
    ? await prisma.student.findMany({ where: { churchId, id: { in: studentIds } }, select: { id: true, studentNumber: true, firstName: true, lastName: true } })
    : [];
  const studentById = new Map(students.map((st) => [st.id, st]));
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

  // Columns that only matter to orgs using them: student ID/name (Student Giving), the term field, and the payment
  // note (payment mode, where staff identify payments by note). Everyone else sees the table exactly as before.
  const showStudentCols = Boolean(church?.studentGivingEnabled);
  const showTermCol = Boolean(church?.studentGivingEnabled || church?.termFieldEnabled);
  const showNoteCol = Boolean(church?.paymentMode);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900">Payments</h2>
        <PaymentsHeaderActions
          key={takePayment ?? "closed"}
          openOnLoad={takePayment === "1" && auth.role !== "viewer"}
          finixMerchantId={church?.finixMerchantId || ""}
          churchName={church?.name || ""}
          pricing={{
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {revenueBySource.rows
          .filter((r) => r.key !== "OTHER" || r.count > 0)
          .map((r) => (
            <div key={r.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{pw(r.label)}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCents(r.grossCents)}</p>
              <p className="text-xs text-slate-400">
                {r.count} payment{r.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        <div className="bg-slate-900 rounded-2xl shadow-sm px-5 py-4">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total received</p>
          <p className="mt-1 text-xl font-bold text-white">{formatCents(revenueBySource.totalCents)}</p>
          <p className="text-xs text-slate-400">
            {revenueBySource.totalCount} payment{revenueBySource.totalCount === 1 ? "" : "s"} · selected range
          </p>
        </div>
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
                <th className="px-6 py-3">{modeLabel(church?.paymentMode, "donor")}</th>
                {showStudentCols && <th className="px-6 py-3">Student ID</th>}
                {showStudentCols && <th className="px-6 py-3">Student</th>}
                {showTermCol && <th className="px-6 py-3">Term</th>}
                {showNoteCol && <th className="px-6 py-3">Note</th>}
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Payment Instrument</th>
                <th className="px-6 py-3">Instrument Type</th>
                <th className="px-6 py-3">Fund</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ transfer: t, instrument, donor, refund, displayStatus, payment }) => {
                const last4Value = instrument?.cardLast4 || instrument?.bankLast4;
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
                    {showStudentCols && (
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {payment?.studentId ? studentById.get(payment.studentId)?.studentNumber ?? "—" : "—"}
                      </td>
                    )}
                    {showStudentCols && (
                      <td className="px-6 py-3 text-slate-700">
                        {payment?.studentId && studentById.get(payment.studentId)
                          ? `${studentById.get(payment.studentId)!.firstName} ${studentById.get(payment.studentId)!.lastName}`
                          : "—"}
                      </td>
                    )}
                    {showTermCol && <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{payment?.studentTermLabel || "—"}</td>}
                    {showNoteCol && <td className="px-6 py-3 text-slate-600 max-w-[220px] break-words">{payment?.note || "—"}</td>}
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
                    <td className="px-6 py-3">
                      <PaymentInstrumentCell
                        cardBrand={instrument?.cardBrand}
                        paymentMethodType={instrument?.paymentMethodType}
                        last4={last4Value}
                        holderName={instrument?.accountHolderName}
                      />
                    </td>
                    <td className="px-6 py-3">
                      <InstrumentTypeCell paymentMethodType={instrument?.paymentMethodType} cardType={instrument?.cardType} />
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {payment?.fundName ||
                        ((t.tagsJson as Record<string, string> | null)?.source === "wgc_invoice_payment"
                          ? `Invoice ${(t.tagsJson as Record<string, string>).invoiceNumber || ""}`
                          : "Unspecified")}
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {payment
                        ? pw(SOURCE_LABELS[classifySource(payment)].replace(/ \(.*\)$/, ""))
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {payment ? (
                        <a
                          href={`/api/merchant/transactions/payments/${t.finixTransferId}/receipt-view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View / print receipt"
                          aria-label="View or print receipt"
                          className="inline-flex text-slate-400 hover:text-blue-600"
                        >
                          <Printer className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
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
