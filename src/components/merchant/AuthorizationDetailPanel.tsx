import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveAuthorizationEffectiveStatus, isAuthorizationCaptured } from "@/lib/finix/authorizationStatus";
import { CheckCircle2, Circle, XCircle } from "lucide-react";

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm py-1 gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-700 text-right break-all">{value}</span>
    </div>
  );
}

function FlowStep({
  label,
  detail,
  done,
  failed,
}: {
  label: string;
  detail?: string;
  done: boolean;
  failed?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {failed ? (
        <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      ) : done ? (
        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
      )}
      <div>
        <p className={`text-sm font-semibold ${done || failed ? "text-slate-800" : "text-slate-400"}`}>
          {label}
        </p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
    </div>
  );
}

export default async function AuthorizationDetailPanel({
  authorizationId,
  churchId,
}: {
  authorizationId: string;
  churchId: string;
}) {
  const auth = await prisma.finixAuthorization.findFirst({
    where: { finixAuthorizationId: authorizationId, churchId },
  });

  if (!auth) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
        <p className="text-sm text-slate-500">Authorization not found.</p>
      </div>
    );
  }

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const instrument = auth.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: auth.finixPaymentInstrumentId },
      })
    : null;

  const donor = instrument?.donorId
    ? await prisma.donor.findUnique({ where: { id: instrument.donorId } })
    : null;

  const payment = auth.finixTransferId
    ? await prisma.payment.findFirst({ where: { finixTransferId: auth.finixTransferId, churchId } })
    : null;

  const effectiveStatus = resolveAuthorizationEffectiveStatus(auth);
  const captured = isAuthorizationCaptured(auth);
  const tags = (auth.tagsJson as Record<string, string> | null) ?? null;

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Authorization</h3>
        <ClosePanelButton />
      </div>

      {/* Amount + effective status */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-2xl font-bold text-slate-900">{formatCents(auth.amountCents ?? 0)}</p>
        {auth.amountRequestedCents != null && auth.amountRequestedCents !== auth.amountCents && (
          <p className="text-xs text-slate-400 mt-0.5">Requested {formatCents(auth.amountRequestedCents)}</p>
        )}
        <div className="mt-2">
          <StateBadge state={effectiveStatus} />
        </div>
        {auth.failureCode && (
          <p className="text-xs text-red-500 mt-1">{auth.failureCode}: {auth.failureMessage}</p>
        )}
      </div>

      {/* Donor */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Donor</h4>
        <div className="space-y-0.5">
          <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
          <Row label="Email" value={donor?.email || "—"} />
          <Row label="Phone" value={donor?.phone || "—"} />
        </div>
      </div>

      {/* Payment instrument */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Instrument</h4>
        <div className="space-y-0.5">
          <Row
            label="Type"
            value={instrument ? (instrument.cardBrand || (instrument.bankLast4 ? "Bank Account" : "—")) : "—"}
          />
          <Row label="Last Four" value={instrument?.cardLast4 || instrument?.bankLast4 || "—"} />
          {instrument?.cardExpirationMonth && instrument?.cardExpirationYear && (
            <Row label="Card Expires" value={`${instrument.cardExpirationMonth}/${instrument.cardExpirationYear}`} />
          )}
          <Row label="CVV Verification" value={titleCase(auth.cvvVerification ?? instrument?.securityCodeVerification)} />
          <Row label="Address Verification" value={titleCase(auth.addressVerification ?? instrument?.addressVerification)} />
        </div>
      </div>

      {/* Transaction flow */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Transaction Flow</h4>
        <div className="space-y-3">
          <FlowStep
            label="Authorization Created"
            detail={formatDateTime(auth.createdAtFinix)}
            done
            failed={auth.state === "FAILED" && !captured}
          />
          {captured ? (
            <FlowStep label="Captured" detail={formatDateTime(auth.updatedAtFinix)} done />
          ) : auth.isVoid ? (
            <FlowStep label="Voided" detail={formatDateTime(auth.voidedAt)} done />
          ) : effectiveStatus === "EXPIRED" ? (
            <FlowStep label="Expired" detail={formatDateTime(auth.expiresAt)} done />
          ) : (
            <FlowStep label="Awaiting Capture or Void" done={false} />
          )}
        </div>
      </div>

      {/* Authorization details */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Authorization Details</h4>
        <div className="space-y-0.5">
          <Row label="ID" value={<CopyableIdBadge id={auth.finixAuthorizationId} />} />
          <Row label="Authorization Code" value={auth.authorizationCode || "—"} />
          <Row label="Expiration Date" value={formatDateTime(auth.expiresAt)} />
          <Row label="Voided Status" value={auth.isVoid ? `Yes — ${formatDateTime(auth.voidedAt)}` : "No"} />
          <Row label="Captured Status" value={captured ? "Captured" : "Not Captured"} />
        </div>
      </div>

      {/* Organization */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Organization</h4>
        <Row label="Church" value={church?.name || "—"} />
      </div>

      {/* Receipt */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Receipt</h4>
        {captured && payment ? (
          payment.receiptSentAt ? (
            <Row label="Sent" value={formatDateTime(payment.receiptSentAt)} />
          ) : (
            <p className="text-sm text-slate-500">No receipt sent for this transaction yet.</p>
          )
        ) : (
          <p className="text-sm text-slate-500">
            No receipt — this authorization was not captured into a transaction.
          </p>
        )}
      </div>

      {/* Tags */}
      {tags && Object.keys(tags).length > 0 && (
        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tags</h4>
          <div className="space-y-0.5">
            {Object.entries(tags).map(([key, value]) => (
              <Row key={key} label={titleCase(key)} value={String(value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
