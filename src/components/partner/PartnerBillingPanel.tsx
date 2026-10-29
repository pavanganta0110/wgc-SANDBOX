"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

interface Billing {
  pricePerMerchantCents: number | null;
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  next: { period: string; chargeDate: string; merchantCount: number; amountCents: number | null };
  invoices: { id: string; period: string; merchantCount: number; unitPriceCents: number; amountCents: number; status: string; chargedAt: string | null; failureReason: string | null }[];
  error?: string;
}

const usd = (cents: number | null) => (cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100));
const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—");
const statusLabel: Record<string, { text: string; tone: string }> = {
  SUCCEEDED: { text: "Paid", tone: "text-green-700" },
  PENDING: { text: "Waiting to be charged", tone: "text-slate-600" },
  AWAITING_CARD: { text: "Needs a card", tone: "text-orange-700" },
  CHARGING: { text: "Charging", tone: "text-slate-600" },
  FAILED: { text: "Payment failed", tone: "text-red-600" },
  WAIVED: { text: "Waived", tone: "text-slate-600" },
};
const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";

export default function PartnerBillingPanel() {
  const [data, setData] = useState<Billing | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<FinixPaymentFormInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/billing")
      .then((r) => r.json() as Promise<Billing>)
      .then((d) => {
        if (cancelled) return;
        if (d.error) setMessage({ text: d.error, error: true });
        else setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const showForm = editingCard || (data !== null && !data.card);

  const mountForm = useCallback(() => {
    if (!APPLICATION_ID) return;
    const container = document.getElementById("partner-billing-finix-form");
    if (!container) return;
    container.innerHTML = "";
    mountFinixPaymentForm("partner-billing-finix-form", APPLICATION_ID, { paymentMethods: ["card"], showAddress: false })
      .then((instance) => {
        formRef.current = instance;
        setFormReady(true);
      })
      .catch(() => setMessage({ text: "The secure card form couldn't load. Refresh the page and try again.", error: true }));
  }, []);

  useEffect(() => {
    if (!showForm) return;
    mountForm();
  }, [showForm, mountForm]);

  async function saveCard() {
    if (!formRef.current) return;
    setSaving(true);
    setMessage(null);
    try {
      // Finix's form hands back a one-time token. The card number never touches our server.
      const token = await new Promise<string>((resolve, reject) => {
        formRef.current!.submit((err, res) => {
          const id = res?.data?.id;
          if (err || !id) reject(new Error("The card details were not accepted. Please check them and try again."));
          else resolve(id);
        });
      });
      const res = await fetch("/api/partner/billing/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financeInstrumentToken: token, authorizationAccepted: authorized }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't save that card.");
      setMessage({ text: "Card saved.", error: false });
      setEditingCard(false);
      setAuthorized(false);
      setFormReady(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "We couldn't save that card.", error: true });
    } finally {
      setSaving(false);
    }
  }

  if (!data) return message ? <p className="text-sm text-red-600">{message.text}</p> : <p className="text-sm text-slate-500">Loading…</p>;

  const notBilled = data.pricePerMerchantCents == null;
  const failed = data.invoices.find((i) => i.status === "FAILED");

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}
      {failed && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Your {failed.period} payment of {usd(failed.amountCents)} didn&apos;t go through{failed.failureReason ? `: ${failed.failureReason}` : ""}. Save a new card below and we&apos;ll try again right away.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Price per approved merchant" value={notBilled ? "Not set yet" : `${usd(data.pricePerMerchantCents)} / month`} />
        <Stat label="Merchants counted next month" value={String(data.next.merchantCount)} />
        <Stat label={`Next charge · ${dateFmt(data.next.chargeDate)}`} value={notBilled ? "—" : usd(data.next.amountCents)} />
      </div>
      <p className="text-xs text-slate-500">
        Each month your card is charged the price above for every merchant approved under your account. A merchant starts counting the month after it is approved, and each new
        approval raises the next charge. Your merchants are never billed by WGC.
      </p>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Card on file</h3>
        {data.card && !editingCard ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-slate-800">
              {data.card.brand} ending {data.card.last4}
              {data.card.expMonth && data.card.expYear ? ` · expires ${String(data.card.expMonth).padStart(2, "0")}/${data.card.expYear}` : ""}
            </p>
            <button type="button" onClick={() => setEditingCard(true)} className="text-sm font-semibold text-blue-700">
              Change card
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {!APPLICATION_ID && <p className="text-sm text-red-600">The card form isn&apos;t set up on this environment.</p>}
            <div id="partner-billing-finix-form" className="min-h-[120px]" />
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
              <span>I authorize WGC Payments to charge this card each month for the merchants approved under my account, at the price shown above.</span>
            </label>
            <div className="flex gap-3">
              <button type="button" disabled={!formReady || !authorized || saving} onClick={saveCard} className={buttonClass}>
                {saving ? "Saving…" : "Save card"}
              </button>
              {data.card && (
                <button type="button" onClick={() => setEditingCard(false)} className="text-sm font-semibold text-slate-700">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-900 px-4 pt-4">Invoices</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Month</th>
              <th className="px-4 py-3 font-semibold text-right">Merchants</th>
              <th className="px-4 py-3 font-semibold text-right">Price each</th>
              <th className="px-4 py-3 font-semibold text-right">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              data.invoices.map((i) => {
                const s = statusLabel[i.status] ?? { text: i.status, tone: "text-slate-600" };
                return (
                  <tr key={i.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-slate-900">{i.period}</td>
                    <td className="px-4 py-3 text-right">{i.merchantCount}</td>
                    <td className="px-4 py-3 text-right">{usd(i.unitPriceCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{usd(i.amountCents)}</td>
                    <td className={`px-4 py-3 ${s.tone}`}>{s.text}</td>
                    <td className="px-4 py-3 text-slate-600">{dateFmt(i.chargedAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
