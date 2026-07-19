import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase, instrumentStateLabel } from "@/lib/finix/displayFormatters";
import { Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { TransactionTimeline } from "@/components/merchant/detail/TransactionTimeline";
import { RelatedResources } from "@/components/merchant/detail/RelatedResources";
import EvidenceUpload from "./EvidenceUpload";
import { loadDisputeDetail } from "@/lib/finix/disputeDetail";
import { buildDisputeTimeline } from "@/lib/finix/disputeTimeline";
import { resolveDisputeDisplayStatus, DISPUTE_DISPLAY_STATUS_LABELS } from "@/lib/finix/disputeStatus";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import DisputeDeadlineBanner from "@/components/merchant/DisputeDeadlineBanner";
import DisputeFinancialImpactCard from "@/components/merchant/DisputeFinancialImpactCard";
import DisputeAuditHistory from "@/components/merchant/DisputeAuditHistory";
import DisputeInternalNote from "@/components/merchant/DisputeInternalNote";

export default async function DisputeFullDetailPage({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const churchId = auth.churchId;
  const { disputeId } = await params;
  const permissions = getDisputePermissions(auth.rawRole);
  if (!permissions.canView) {
    redirect("/merchant/dashboard");
  }

  const detail = await loadDisputeDetail(disputeId, churchId);

  // Team-access: FUNDRAISER/VIEWER may only open a dispute whose
  // originating payment is attributed to them — canView being true does
  // not mean every dispute in the church is visible to them, only their
  // own (see resolveScopedTransferIds/getDisputePermissions).
  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope);
  if (scopedUserId && detail?.payment?.attributedUserId !== scopedUserId) {
    redirect("/merchant/disputes");
  }

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/disputes" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Disputes
        </Link>
        <p className="text-sm text-slate-500">This dispute could not be found.</p>
      </div>
    );
  }

  const { dispute, church, transfer, instrument, donor, settlement, deposit, payment, activeEvidence } = detail;
  const displayStatus = resolveDisputeDisplayStatus(dispute);
  const timeline = buildDisputeTimeline(detail);
  const locked = Boolean(dispute.respondedAt);

  const relatedResources = [
    ...(dispute.finixTransferId
      ? [{ type: "Payment", label: dispute.finixTransferId, href: `/merchant/transactions/payments?id=${dispute.finixTransferId}` }]
      : []),
    ...(settlement
      ? [{ type: "Settlement", label: settlement.finixSettlementId, href: `/merchant/settlements?id=${settlement.finixSettlementId}` }]
      : []),
    ...(deposit
      ? [{ type: "Deposit", label: deposit.finixFundingTransferAttemptId, href: `/merchant/deposits?id=${deposit.finixFundingTransferAttemptId}` }]
      : []),
  ];

  return (
    <div>
      <Link href="/merchant/disputes" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Disputes
      </Link>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Dispute · {formatDateTime(dispute.createdAtFinix)}</span>
              <CopyableIdBadge id={dispute.finixDisputeId} />
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(dispute.amountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{dispute.currency || "USD"}</span>
              </div>
              <StateBadge state={displayStatus} />
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Donor: <span className="font-semibold text-slate-900">{formatPersonName(donor?.name, instrument?.accountHolderName)}</span>
              {" · "}
              Organization: <span className="font-semibold text-slate-900">{church?.name || "—"}</span>
            </p>
            <DisputeDeadlineBanner evidenceDueAt={dispute.evidenceDueAt} respondedAt={dispute.respondedAt} />
          </div>

          <DisputeFinancialImpactCard
            originalAmountCents={transfer?.amountCents ?? null}
            disputedAmountCents={dispute.amountCents}
            displayStatus={displayStatus}
          />

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <TransactionTimeline events={timeline} />
          </div>

          {/* Dispute Details */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Dispute Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Reason" value={titleCase(dispute.reason)} />
              <Row label="Status" value={DISPUTE_DISPLAY_STATUS_LABELS[displayStatus]} />
              {dispute.outcome && <Row label="Outcome" value={titleCase(dispute.outcome)} />}
              <Row label="Evidence Due" value={formatDateTime(dispute.evidenceDueAt)} />
              <Row label="Responded" value={formatDateTime(dispute.respondedAt)} />
              <Row label="Resolved" value={formatDateTime(dispute.resolvedAt)} />
            </div>
          </div>

          {/* Evidence */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Evidence</h3>
            <EvidenceUpload
              disputeId={dispute.finixDisputeId}
              locked={locked}
              evidence={activeEvidence.map((e) => ({
                id: e.id,
                fileName: e.fileName,
                fileSize: e.fileSize,
                mimeType: e.mimeType,
                uploadedByEmail: e.uploadedByEmail,
                submittedAt: e.submittedAt,
                createdAt: e.createdAt,
              }))}
              submissionError={dispute.submissionError}
              submissionRetryCount={dispute.submissionRetryCount}
              canUpload={permissions.canUpload}
              canDelete={permissions.canDelete}
              canSubmit={permissions.canSubmit}
            />
          </div>

          {/* Original Payment */}
          {transfer && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Original Payment</h3>
              <Row label="Payment ID" value={<CopyableIdBadge id={transfer.finixTransferId} />} />
              <Row label="Amount" value={formatCents(transfer.amountCents ?? 0)} />
              <Row label="Payment Date" value={formatDateTime(transfer.createdAtFinix)} />
              <Row label="Payment Status" value={titleCase(transfer.state)} />
              {transfer.statementDescriptor && <Row label="Statement Descriptor" value={transfer.statementDescriptor} />}
              {(instrument?.cardLast4 || instrument?.bankLast4) && (
                <Row label="Card / Bank Last Four" value={instrument.cardLast4 || instrument.bankLast4 || "—"} />
              )}
              {instrument && (
                <Row
                  label="Payment Method"
                  value={instrument.cardBrand || (instrument.bankLast4 ? "Bank Account" : instrument.instrumentType || "—")}
                />
              )}
              {payment?.givingPageId && <Row label="Linked Giving Page" value={payment.givingPageId} />}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Donor */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Donor</h3>
            <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
            <Row label="Email" value={donor?.email || "—"} />
            <Row label="Phone" value={donor?.phone || "—"} />
          </div>

          {/* Payment Instrument */}
          {instrument && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Instrument</h3>
              <Row label="State" value={instrumentStateLabel(instrument.state)} />
              <Row label="Type" value={instrument.cardBrand || (instrument.bankLast4 ? "Bank Account" : instrument.instrumentType || "—")} />
              <Row
                label="Masked Number"
                value={instrument.cardLast4 || instrument.bankLast4 ? `••••${instrument.cardLast4 || instrument.bankLast4}` : "—"}
              />
              <Row label="Account Holder Name" value={instrument.accountHolderName || "—"} />
            </div>
          )}

          {/* Settlement Information */}
          {settlement && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Settlement Information</h3>
              <Row label="Settlement ID" value={<CopyableIdBadge id={settlement.finixSettlementId} />} />
              <Row label="State" value={titleCase(settlement.state)} />
              <Row label="Total Amount" value={formatCents(settlement.totalAmountCents ?? 0)} />
              <Row label="Net Amount" value={formatCents(settlement.netAmountCents ?? 0)} />
              {settlement.disputeAmountCents != null && (
                <Row label="Dispute Amount in Settlement" value={formatCents(settlement.disputeAmountCents)} />
              )}
              <Row label="Settled" value={formatDateTime(settlement.settledAt)} />
            </div>
          )}

          {/* Deposit Information */}
          {deposit && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Deposit Information</h3>
              <Row label="Deposit ID" value={<CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />} />
              <Row label="State" value={titleCase(deposit.state)} />
              <Row label="Amount" value={formatCents(deposit.amountCents ?? 0)} />
              <Row label="Bank Account" value={deposit.bankAccountLast4 ? `•••• ${deposit.bankAccountLast4}` : "—"} />
              <Row label="Sent" value={formatDateTime(deposit.sentAt)} />
            </div>
          )}

          {/* Related Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
            <Row label="Organization" value={church?.name || "—"} />
            <RelatedResources resources={relatedResources} />
          </div>

          {/* Internal Notes */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Internal Notes</h3>
            <DisputeInternalNote
              disputeId={dispute.finixDisputeId}
              initialNote={dispute.internalNote || ""}
              editable={permissions.canUpload}
            />
          </div>

          {/* Audit History — lazy-loaded, doesn't block the rest of the page */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Audit History</h3>
            <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
              <DisputeAuditHistory finixDisputeId={dispute.finixDisputeId} churchId={churchId} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
