"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Handshake, RefreshCw, Store } from "lucide-react";
import { formatCents } from "@/lib/format";

interface MerchantRow {
  churchId: string;
  name: string;
  reference: string | null;
  status: string;
  onboardingStatus: string | null;
  approvedAt: string | null;
  processedCents: number;
  paymentCount: number;
  refundedCents: number;
  finixFeesCents: number;
  wgcChargedCents: number;
  depositedCents: number;
  awaitingDepositCents: number;
}
interface EstimateMonth {
  month: string;
  label: string;
  partnerChargedCents: number;
  sharePercent: number;
  estimatedFinixCostsCents: number | null;
  estimatedResidualCents: number | null;
}
interface Stats {
  partner: { id: string; name: string; pricePerMerchantCents: number | null };
  merchants: { linked: number; processing: number; active: number };
  processed: { amountCents: number; count: number };
  byMethod: Record<"CARD" | "ACH" | "OTHER", { amountCents: number; count: number }>;
  refundsCents: number;
  achReturnsCents: number;
  netProcessedCents: number;
  averagePaymentCents: number;
  moneyFlow: { finixFeesCents: number; donorCoveredFeesCents: number; depositedCents: number; pulledBackCents: number; awaitingDepositCents: number };
  wgc: {
    chargedCents: number;
    partnerBillingInvoicedCents: number;
    partnerBillingCollectedCents: number;
    estimatedFinixCostsCents: number;
    estimatedResidualCents: number;
    monthsAwaitingStatement: number;
    months: EstimateMonth[];
    estimatedRevenueCents: number;
  };
  byMerchant: MerchantRow[];
}

// Local-date YYYY-MM-DD, the way the Merchants directory builds its date range.
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
};
const PRESETS: { key: string; label: string; range: () => { from: string; to: string } }[] = [
  { key: "mtd", label: "This month", range: () => { const n = new Date(); return { from: toDateInput(new Date(n.getFullYear(), n.getMonth(), 1)), to: toDateInput(n) }; } },
  { key: "last", label: "Last month", range: () => { const n = new Date(); return { from: toDateInput(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: toDateInput(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { key: "30d", label: "Last 30 days", range: () => ({ from: daysAgo(29), to: toDateInput(new Date()) }) },
  { key: "90d", label: "Last 90 days", range: () => ({ from: daysAgo(89), to: toDateInput(new Date()) }) },
  { key: "ytd", label: "This year", range: () => { const n = new Date(); return { from: toDateInput(new Date(n.getFullYear(), 0, 1)), to: toDateInput(n) }; } },
  { key: "all", label: "All time", range: () => ({ from: "2020-01-01", to: toDateInput(new Date()) }) },
];

const badge = (status: string | null) => {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "PENDING":
    case "UNDER_REVIEW":
    case "MORE_INFORMATION_REQUIRED":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "DISABLED":
    case "REJECTED":
    case "TERMINATED":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

export default function PartnerPerformance({ partnerId }: { partnerId: string }) {
  const initial = PRESETS[0].range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/stats?from=${from}&to=${to}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to load partner numbers");
      setStats(body as Stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [partnerId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/partners" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All partners
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Handshake className="h-6 w-6 text-indigo-600" />
          {stats?.partner.name ?? "Partner"}
        </h1>
        <p className="text-slate-500 mt-1">What this partner's merchants process, and what WGC earns from it.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              const r = p.range();
              setFrom(r.from);
              setTo(r.to);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${activePreset === p.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
          >
            {p.label}
          </button>
        ))}
        <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg py-1.5 px-2 shadow-sm" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg py-1.5 px-2 shadow-sm" />
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-rose-600">
          <AlertCircle className="h-8 w-8" />
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : loading || !stats ? (
        <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
          <p>Loading partner numbers...</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <GroupLabel hint="Successful charges, same rules as the main dashboard">Processing</GroupLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Total processed" value={formatCents(stats.processed.amountCents)} note="Gross, before refunds and returns" />
              <Tile label="Card" value={formatCents(stats.byMethod.CARD.amountCents)} note={`${stats.byMethod.CARD.count.toLocaleString()} payments`} />
              <Tile label="ACH" value={formatCents(stats.byMethod.ACH.amountCents)} note={`${stats.byMethod.ACH.count.toLocaleString()} payments`} />
              <Tile label="Net processed" value={formatCents(stats.netProcessedCents)} note={`${formatCents(stats.refundsCents + stats.achReturnsCents)} refunded or returned`} />
              <Tile label="Payments" value={stats.processed.count.toLocaleString()} />
              <Tile label="Average payment" value={formatCents(stats.averagePaymentCents)} />
              <Tile label="Refunds" value={formatCents(stats.refundsCents)} note="Merchant-issued" />
              <Tile label="ACH returns" value={formatCents(stats.achReturnsCents)} note="Returned by the bank" />
            </div>
          </section>

          <section className="space-y-3">
            <GroupLabel hint="Fees billed to these merchants and money moved to their banks, as Finix records it">Fees and deposits</GroupLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Platform fees charged" value={formatCents(stats.moneyFlow.finixFeesCents)} note="Billed to the merchants (WGC's fee, Finix record)" />
              <Tile label="Donor-covered fees" value={formatCents(stats.moneyFlow.donorCoveredFeesCents)} note="Part of the fees above" />
              <Tile label="Deposited to banks" value={formatCents(stats.moneyFlow.depositedCents)} note={`${formatCents(stats.moneyFlow.pulledBackCents)} pulled back for fees`} />
              <Tile label="Awaiting deposit" value={formatCents(stats.moneyFlow.awaitingDepositCents)} note="Usually money still in flight" />
            </div>
          </section>

          <section className="space-y-3">
            <GroupLabel hint="What WGC earns from this partner">WGC revenue</GroupLabel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Fees charged (WGC record)" value={formatCents(stats.wgc.chargedCents)} note="WGC's own record on these payments" />
              <Tile label="Finix cost (estimate)" value={formatCents(stats.wgc.estimatedFinixCostsCents)} note="Partner's share of Finix's statements" />
              <Tile label="Residual (estimate)" value={formatCents(stats.wgc.estimatedResidualCents)} note="Paid by Finix to WGC, partner's share" />
              <Tile label="Partner billing" value={formatCents(stats.wgc.partnerBillingCollectedCents)} note={`${formatCents(stats.wgc.partnerBillingInvoicedCents)} invoiced`} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total WGC revenue (estimate)</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{formatCents(stats.wgc.estimatedRevenueCents)}</div>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                Residual share plus partner billing collected. Finix reports its costs and residual once a month for all merchants together, not per merchant, so
                the partner's part is its share of the fees WGC charged that month times Finix's statement. Months without an imported statement are not counted
                {stats.wgc.monthsAwaitingStatement > 0 ? ` (${stats.wgc.monthsAwaitingStatement} awaiting Finix's statement)` : ""}.
              </p>
            </div>
            {stats.wgc.months.some((m) => m.partnerChargedCents > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-6 py-3">Month</th>
                      <th scope="col" className="px-6 py-3 text-right">Fees charged (WGC)</th>
                      <th scope="col" className="px-6 py-3 text-right">Share of platform</th>
                      <th scope="col" className="px-6 py-3 text-right">Finix cost (est.)</th>
                      <th scope="col" className="px-6 py-3 text-right">Residual (est.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.wgc.months.map((m) => (
                      <tr key={m.month}>
                        <td className="px-6 py-3 whitespace-nowrap">{m.label}</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">{formatCents(m.partnerChargedCents)}</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">{m.sharePercent}%</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">{m.estimatedFinixCostsCents === null ? "Awaiting statement" : formatCents(m.estimatedFinixCostsCents)}</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">{m.estimatedResidualCents === null ? "Awaiting statement" : formatCents(m.estimatedResidualCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <GroupLabel hint="Live account counts">Merchants</GroupLabel>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Tile label="Linked" value={stats.merchants.linked.toLocaleString()} note="Merchants of this partner" />
              <Tile label="Processing" value={`${stats.merchants.processing} of ${stats.merchants.linked}`} note="At least one charge in this period" />
              <Tile label="Active" value={stats.merchants.active.toLocaleString()} note="Live Finix account, not terminated" />
            </div>
          </section>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Store className="h-5 w-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Where it comes from</h2>
              <span className="text-xs text-slate-500">Largest first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-6 py-4">Merchant</th>
                    <th scope="col" className="px-6 py-4">Statuses</th>
                    <th scope="col" className="px-6 py-4 text-right">Processed</th>
                    <th scope="col" className="px-6 py-4 text-right">Payments</th>
                    <th scope="col" className="px-6 py-4 text-right">Refunded</th>
                    <th scope="col" className="px-6 py-4 text-right">Fees (Finix)</th>
                    <th scope="col" className="px-6 py-4 text-right">Fees (WGC)</th>
                    <th scope="col" className="px-6 py-4 text-right">Deposited</th>
                    <th scope="col" className="px-6 py-4 text-right">Awaiting</th>
                    <th scope="col" className="px-6 py-4">Approved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {stats.byMerchant.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-slate-500">No merchants are linked to this partner yet.</td>
                    </tr>
                  ) : (
                    stats.byMerchant.map((m) => (
                      <tr key={m.churchId} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link href={`/admin/merchants/${m.churchId}`} className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline block">
                            {m.name}
                          </Link>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{m.reference ? `ref ${m.reference}` : m.churchId}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5 text-xs">
                            <span className={`self-start px-2 py-0.5 rounded-full border text-[10px] font-medium ${badge(m.status)}`}>{m.status}</span>
                            {m.onboardingStatus && <span className={`self-start px-2 py-0.5 rounded-full border text-[10px] font-medium ${badge(m.onboardingStatus)}`}>{m.onboardingStatus}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCents(m.processedCents)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{m.paymentCount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{m.refundedCents > 0 ? formatCents(m.refundedCents) : "-"}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{formatCents(m.finixFeesCents)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{formatCents(m.wgcChargedCents)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{formatCents(m.depositedCents)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">{formatCents(m.awaitingDepositCents)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs">{m.approvedAt ? new Date(m.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {stats.byMerchant.length > 0 && (
                  <tfoot className="bg-slate-50 text-slate-900 font-semibold border-t border-slate-200">
                    <tr>
                      <td className="px-6 py-3" colSpan={2}>Total</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.byMerchant.reduce((a, m) => a + m.processedCents, 0))}</td>
                      <td className="px-6 py-3 text-right">{stats.byMerchant.reduce((a, m) => a + m.paymentCount, 0).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.byMerchant.reduce((a, m) => a + m.refundedCents, 0))}</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.moneyFlow.finixFeesCents)}</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.wgc.chargedCents)}</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.moneyFlow.depositedCents)}</td>
                      <td className="px-6 py-3 text-right">{formatCents(stats.moneyFlow.awaitingDepositCents)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
