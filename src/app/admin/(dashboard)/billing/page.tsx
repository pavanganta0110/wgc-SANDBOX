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

interface PricingVersionRow {
  id: string;
  planCode: string;
  planName: string;
  monthlyAmountCents: number;
  isDefaultForNewOrgs: boolean;
  status: string;
  effectiveFrom: string;
}

interface InvoiceBillingConfigRow {
  id: string;
  mode: string;
  status: string;
  effectiveFrom: string;
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function cents(c: number | undefined) {
  return c != null ? `$${(c / 100).toFixed(2)}` : "—";
}

const TABS = ["Organizations", "Pricing", "Invoice Billing"] as const;
type Tab = (typeof TABS)[number];

export default function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>("Organizations");
  const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingFor, setGrantingFor] = useState<OrgBillingRow | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const reconcileNow = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/admin/billing/reconcile", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Reconciliation failed");
      toast.success(`Reconciled ${body.scannedCount} subscription(s), ${body.updatedCount} updated, ${body.flags?.length ?? 0} flag(s).`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  const load = () => {
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
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">Billing & Subscriptions</h1>
        <button
          onClick={reconcileNow}
          disabled={reconciling}
          className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {reconciling ? "Reconciling…" : "Reconcile Now"}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Every organization’s WGC platform subscription, promotion, and billing status. All values come directly from the database and
        Finix — nothing here can be manually typed as &quot;successful.&quot;
      </p>

      <div className="flex items-center gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-semibold ${tab === t ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Pricing" && <PricingTab />}
      {tab === "Invoice Billing" && <InvoiceBillingTab />}

      {tab === "Organizations" && (
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
      )}

      {grantingFor && <GrantFreeMonthsModal org={grantingFor} onClose={() => setGrantingFor(null)} onDone={() => { setGrantingFor(null); load(); }} />}
    </div>
  );
}

function PricingTab() {
  const [versions, setVersions] = useState<PricingVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [planCode, setPlanCode] = useState("WGC_STANDARD");
  const [planName, setPlanName] = useState("WGC Platform");
  const [amount, setAmount] = useState("10.00");
  const [isDefault, setIsDefault] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch("/api/admin/billing/pricing")
      .then((r) => r.json())
      .then((d) => setVersions(d.versions || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!confirmed) {
      toast.error("Confirmation is required to activate a new pricing version.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode,
          planName,
          monthlyAmountCents: Math.round(parseFloat(amount) * 100),
          isDefaultForNewOrgs: isDefault,
          confirmed: true,
          reason,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create pricing version");
      toast.success("New pricing version created. Existing subscriptions are unaffected.");
      setShowForm(false);
      setConfirmed(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create pricing version");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Platform Pricing Versions</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Every version is permanent. Creating a new version never changes an existing subscription’s price — subscriptions keep
            pointing at the version they were created under.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold">
          {showForm ? "Cancel" : "Add Version"}
        </button>
      </div>

      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Plan Code</label>
              <input value={planCode} onChange={(e) => setPlanCode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Plan Name</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Monthly Amount ($)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Apply only to new customers going forward (set as default for new signups)
          </label>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (internal)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Impact preview:</strong> this creates a new pricing version at ${amount}/month. Existing customers keep their current
            price. {isDefault ? "New signups will default to this price." : "This will not be the default for new signups unless selected."}
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            I confirm this pricing change and understand it does not retroactively affect existing subscriptions.
          </label>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Creating…" : "Create Version"}
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Plan</th>
            <th className="text-left py-2">Amount</th>
            <th className="text-left py-2">Default</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Effective</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {versions.map((v) => (
            <tr key={v.id}>
              <td className="py-2">{v.planName} ({v.planCode})</td>
              <td className="py-2">{cents(v.monthlyAmountCents)}</td>
              <td className="py-2">{v.isDefaultForNewOrgs ? "Yes" : "No"}</td>
              <td className="py-2">{v.status}</td>
              <td className="py-2">{fmt(v.effectiveFrom)}</td>
            </tr>
          ))}
          {!loading && versions.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-slate-400">No pricing versions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const INVOICE_MODES = ["DISABLED", "INCLUDED_IN_PLATFORM", "MONTHLY_ADD_ON", "PER_INVOICE_SENT", "PER_INVOICE_PAID", "FLAT_MONTHLY_PLUS_USAGE"];

function InvoiceBillingTab() {
  const [active, setActive] = useState<InvoiceBillingConfigRow | null>(null);
  const [history, setHistory] = useState<InvoiceBillingConfigRow[]>([]);
  const [mode, setMode] = useState("DISABLED");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [usageAmount, setUsageAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch("/api/admin/billing/invoice-config")
      .then((r) => r.json())
      .then((d) => {
        setActive(d.active);
        setHistory(d.history || []);
      });
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!confirmed) {
      toast.error("Confirmation is required.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/invoice-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          monthlyAmountCents: monthlyAmount ? Math.round(parseFloat(monthlyAmount) * 100) : null,
          usageAmountCents: usageAmount ? Math.round(parseFloat(usageAmount) * 100) : null,
          confirmed: true,
          reason,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update invoice billing configuration");
      toast.success(mode === "DISABLED" ? "Saved as draft (still disabled)." : "Invoice billing activated.");
      setConfirmed(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update invoice billing configuration");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Invoice Feature Billing</h3>
      <p className="text-xs text-slate-400 mb-4">
        Currently: <strong>{active ? active.mode : "DISABLED (not yet activated)"}</strong>. No invoice fees are ever charged while
        disabled, and activating a new configuration never bills usage recorded before today.
      </p>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Billing Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
            {INVOICE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {(mode === "MONTHLY_ADD_ON" || mode === "FLAT_MONTHLY_PLUS_USAGE") && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Monthly Add-On Amount ($)</label>
            <input value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
        )}
        {(mode === "PER_INVOICE_SENT" || mode === "PER_INVOICE_PAID" || mode === "FLAT_MONTHLY_PLUS_USAGE") && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Per-Invoice Amount ($)</label>
            <input value={usageAmount} onChange={(e) => setUsageAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (required)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>Impact preview:</strong> mode will change to <strong>{mode}</strong>.{" "}
          {mode === "DISABLED" ? "No organizations are charged." : "This applies to all organizations with invoice access going forward — old usage is never billed retroactively."}
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm this invoice billing configuration change.
        </label>
        <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? "Saving…" : "Save Configuration"}
        </button>
      </div>

      <table className="w-full text-sm mt-6">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Mode</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Effective From</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {history.map((h) => (
            <tr key={h.id}>
              <td className="py-2">{h.mode}</td>
              <td className="py-2">{h.status}</td>
              <td className="py-2">{fmt(h.effectiveFrom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant free months");
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
