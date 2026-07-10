import { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import { formatPersonName } from "@/lib/formatPersonName";
import {
  PanelNavArrows,
  ViewAllDetailsButton,
  PaymentMoreMenu,
  PinButton,
  ComingSoonAction,
} from "@/components/merchant/PaymentDetailActions";

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

function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function DisputeDetailPanel({
  disputeId,
  churchId,
}: {
  disputeId: string;
  churchId: string;
}) {
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId },
  });

  if (!dispute) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This dispute could not be found.</p>
      </div>
    );
  }

  const transfer = dispute.finixTransferId
    ? await prisma.finixTransfer.findFirst({
        where: { finixTransferId: dispute.finixTransferId, churchId },
      })
    : null;

  const instrument = transfer?.finixPaymentInstrumentId
    ? await prisma.finixPaymentInstrumentSnapshot.findUnique({
        where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
      })
    : null;

  const donor = instrument?.donorId
    ? await prisma.donor.findUnique({ where: { id: instrument.donorId } })
    : null;

  type FlowEvent = { label: string; sublabel?: string; date: Date | null };
  const flow: FlowEvent[] = [
    { label: `Dispute Opened`, sublabel: dispute.reason ? titleCase(dispute.reason) : undefined, date: dispute.createdAtFinix },
    ...(dispute.evidenceDueAt
      ? [{ label: "Evidence Due", date: dispute.evidenceDueAt } as FlowEvent]
      : []),
    ...(dispute.respondedAt
      ? [{ label: "Evidence Submitted", date: dispute.respondedAt } as FlowEvent]
      : []),
    ...(dispute.resolvedAt
      ? [
          {
            label: `Dispute Resolved`,
            sublabel: dispute.outcome ? titleCase(dispute.outcome) : undefined,
            date: dispute.resolvedAt,
          } as FlowEvent,
        ]
      : []),
  ]
    .filter((e) => e.date)
    .sort((a, b) => (a.date && b.date ? a.date.getTime() - b.date.getTime() : 0));

  const now = new Date();
  const evidenceOpen =
    dispute.evidenceDueAt && !dispute.respondedAt && dispute.evidenceDueAt.getTime() > now.getTime();

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <PanelNavArrows />
        <ViewAllDetailsButton />
        <ClosePanelButton />
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Dispute · {formatDateTime(dispute.createdAtFinix)}</span>
          <div className="flex items-center gap-1.5">
            <CopyableIdBadge id={dispute.finixDisputeId} />
            <PinButton />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {formatCents(dispute.amountCents ?? 0)}
            </span>
            <span className="text-sm font-semibold text-slate-400">{dispute.currency || "USD"}</span>
          </div>
          <StateBadge state={dispute.state} />
        </div>
        <PaymentMoreMenu />

        {evidenceOpen && (
          <div className="mt-3 flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <span className="text-xs font-semibold text-amber-800">
              Evidence due {formatDateTime(dispute.evidenceDueAt)}
            </span>
            <ComingSoonAction
              label="Submit Evidence"
              feature="Submitting dispute evidence"
              className="text-xs font-bold text-blue-600 hover:underline"
            />
          </div>
        )}

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Donor</span>
            <span className="font-semibold text-slate-700">
              {formatPersonName(donor?.name, instrument?.accountHolderName)}
            </span>
          </div>
          {dispute.finixTransferId && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Payment</span>
              <CopyableIdBadge id={dispute.finixTransferId} label={dispute.finixTransferId} variant="link" />
            </div>
          )}
        </div>
      </div>

      <Section title="Dispute Timeline">
        <div className="space-y-4">
          {flow.map((event, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                {i < flow.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-1">
                <p className="text-sm font-semibold text-slate-800">{event.label}</p>
                {event.sublabel && <p className="text-xs text-slate-500">{event.sublabel}</p>}
                <p className="text-xs text-slate-400">{formatDateTime(event.date)}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Dispute Details">
        <Row label="Reason" value={titleCase(dispute.reason)} />
        <Row label="State" value={titleCase(dispute.state)} />
        {dispute.outcome && <Row label="Outcome" value={titleCase(dispute.outcome)} />}
        <Row label="Evidence Due" value={formatDateTime(dispute.evidenceDueAt)} />
        <Row label="Responded" value={formatDateTime(dispute.respondedAt)} />
        <Row label="Resolved" value={formatDateTime(dispute.resolvedAt)} />
      </Section>

      {instrument && (
        <Section title="Payment Instrument" last>
          <Row label="Type" value={instrument.cardBrand || (instrument.bankLast4 ? "Bank Account" : instrument.instrumentType || "—")} />
          <Row
            label="Masked Number"
            value={
              instrument.cardLast4 || instrument.bankLast4
                ? `••••${instrument.cardLast4 || instrument.bankLast4}`
                : "—"
            }
          />
          <Row label="Account Holder Name" value={instrument.accountHolderName || "—"} />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`px-5 py-4 ${last ? "" : "border-b border-slate-100"}`}>
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700 text-right">{value}</span>
    </div>
  );
}
