"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface OrgBillingRow {
  id: string;
  name: string;
  finixMerchantId: string | null;
  billingSetupStatus: string | null;
  subscription: {
    id: string;
    finixSubscriptionId: string | null;
    status: string;
    amountCents: number;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    firstChargeAt: string | null;
    nextChargeAt: string | null;
    lastChargeAt: string | null;
    pastDueAt: string | null;
    gracePeriodEndsAt: string | null;
  } | null;
  promotion: { id: string; status: string; source: string; endsAt: string | null } | null;
  billingMethodType: string | null;
  maskedBillingDetails: string | null;
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function cents(c: number | undefined) {
  return c != null ? `$${(c / 100).toFixed(2)}` : "—";
}

export default function AdminBillingPage() {
  const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingFor, setGrantingFor] = useState<OrgBillingRow | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/billing/organizations")
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations || []))
      .catch(() => toast.error("Failed to load billing data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Billing & Subscriptions</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every organization's WGC platform subscription, promotion, and billing status. All values come directly from the database and
        Finix — nothing here can be manually typed as "successful."
      </p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Organization</th>
              <th className="text-left px-4 py-3">Billing Setup</th>
              <th className="text-left px-4 py-3">Subscription</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Trial Ends</th>
              <th className="text-left px-4 py-3">Next Charge</th>
              <th className="text-left px-4 py-3">Promotion</th>
              <th className="text-left px-4 py-3">Billing Method</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{o.name}</td>
                <td className="px-4 py-3 text-slate-500">{o.billingSetupStatus || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{o.subscription?.status || "None"}</td>
                <td className="px-4 py-3 text-slate-500">{cents(o.subscription?.amountCents)}</td>
                <td className="px-4 py-3 text-slate-500">{fmt(o.subscription?.trialEndsAt ?? null)}</td>
                <td className="px-4 py-3 text-slate-500">{fmt(o.subscription?.nextChargeAt ?? null)}</td>
                <td className="px-4 py-3 text-slate-500">{o.promotion ? `${o.promotion.source} (${o.promotion.status})` : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{o.maskedBillingDetails || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setGrantingFor(o)} className="text-blue-600 font-semibold hover:underline">
                    Grant Free Months
                  </button>
                </td>
              </tr>
            ))}
            {!loading && orgs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">No organizations yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grantingFor && <GrantFreeMonthsModal org={grantingFor} onClose={() => setGrantingFor(null)} onDone={() => { setGrantingFor(null); load(); }} />}
    </div>
  );
}

function GrantFreeMonthsModal({ org, onClose, onDone }: { org: OrgBillingRow; onClose: () => void; onDone: () => void }) {
  const [months, setMonths] = useState(1);
  const [internalReason, setInternalReason] = useState("");
  const [customerFacingExplanation, setCustomerFacingExplanation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!internalReason.trim()) {
      toast.error("An internal reason is required.");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm this action.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/billing/organizations/${org.id}/grant-free-months`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, internalReason, customerFacingExplanation, confirmed: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to grant free months");
      toast.success(`${months} free month(s) granted to ${org.name}`);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to grant free months");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Grant Free Months</h3>
        <p className="text-sm text-slate-500 mb-4">{org.name}</p>

        <label className="block text-xs font-semibold text-slate-500 mb-1">Number of free months</label>
        <input
          type="number"
          min={1}
          max={24}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3"
        />

        <label className="block text-xs font-semibold text-slate-500 mb-1">Internal reason (required)</label>
        <textarea
          value={internalReason}
          onChange={(e) => setInternalReason(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3"
          rows={2}
        />

        <label className="block text-xs font-semibold text-slate-500 mb-1">Customer-facing explanation</label>
        <textarea
          value={customerFacingExplanation}
          onChange={(e) => setCustomerFacingExplanation(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4"
          rows={2}
        />

        <label className="flex items-start gap-2 text-xs text-slate-600 mb-4">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm I am authorized to grant this promotion and have discussed it with the client.
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Granting…" : "Grant"}
          </button>
        </div>
      </div>
    </div>
  );
}
