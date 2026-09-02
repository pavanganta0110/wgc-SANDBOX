"use client";

import { Fragment, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";

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

const TABS = ["Organizations", "Pricing", "Invoice Billing", "Promotions", "Failed Payments", "Settings", "Terms", "Audit Log", "WGC Profit"] as const;
type Tab = (typeof TABS)[number];

interface PromotionRow {
  id: string;
  code: string;
  name: string;
  customerDescription: string | null;
  durationMonths: number;
  durationDays: number | null;
  normalMonthlyAmountCents: number;
  active: boolean;
  automaticEligibilitySource: string | null;
  maxOrganizations: number | null;
  allowManualGrantToExistingOrg: boolean;
  promotionWaivesPlatformFee: boolean;
  promotionWaivesInvoiceMonthlyFee: boolean;
  promotionWaivesInvoiceUsageFee: boolean;
  createdAt: string;
}

interface PromotionEntitlementRow {
  id: string;
  organizationId: string;
  organizationName: string | null;
  promotionId: string;
  source: string;
  status: string;
  durationMonths: number;
  durationDays: number | null;
  normalMonthlyAmountCents: number;
  grantedAt: string;
  startsAt: string | null;
  endsAt: string | null;
  approvalReason: string | null;
  customerFacingExplanation: string | null;
  canceledAt: string | null;
}

interface FailedPaymentRow {
  id: string;
  organizationId: string;
  organizationName: string | null;
  chargeType: string;
  amountCents: number;
  failureCode: string | null;
  failureMessage: string | null;
  attemptedAt: string;
}

interface BillingSettingsRow {
  id: string;
  gracePeriodDays: number;
  pastDueReminderDays: number[];
  trialEndingReminderDays: number[];
  restrictedFeatureKeys: string[];
  supportContactEmail: string | null;
  updatedAt: string;
}

interface TermsVersionRow {
  id: string;
  termsType: string;
  version: string;
  bodyMarkdown: string;
  publishedAt: string;
  publishedByUserId: string | null;
}

interface AuditLogRow {
  id: string;
  organizationId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  internalReason: string | null;
  createdAt: string;
}

function ExportCsvLink({ type }: { type: string }) {
  return (
    <a
      href={`/api/admin/billing/export/${type}`}
      className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      Export CSV
    </a>
  );
}

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
      {tab === "Promotions" && <PromotionsTab />}
      {tab === "Failed Payments" && <FailedPaymentsTab />}
      {tab === "Settings" && <SettingsTab />}
      {tab === "Terms" && <TermsTab />}
      {tab === "Audit Log" && <AuditLogTab />}
      {tab === "WGC Profit" && <WgcProfitTab />}

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
                <td className="px-4 py-3 text-slate-500">{formatCalendarDateUTC(o.subscription?.nextChargeAt ?? null)}</td>
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

function PromotionsTab() {
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [customerDescription, setCustomerDescription] = useState("");
  const [durationUnit, setDurationUnit] = useState<"months" | "days">("months");
  const [durationMonths, setDurationMonths] = useState("6");
  const [durationDays, setDurationDays] = useState("90");
  const [normalAmount, setNormalAmount] = useState("10.00");
  const [waivesPlatformFee, setWaivesPlatformFee] = useState(true);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleReason, setToggleReason] = useState("");
  const [toggleConfirmed, setToggleConfirmed] = useState(false);
  const [grantingPromotion, setGrantingPromotion] = useState<PromotionRow | null>(null);
  const [viewingEntitlementsFor, setViewingEntitlementsFor] = useState<PromotionRow | null>(null);

  const load = () => {
    fetch("/api/admin/billing/promotions")
      .then((r) => r.json())
      .then((d) => setPromotions(d.promotions || []))
      .catch(() => toast.error("Failed to load promotions"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!confirmed) {
      toast.error("Confirmation is required to create a promotion.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          customerDescription: customerDescription || null,
          // durationMonths always sent (schema keeps it NOT NULL for
          // backward compat) — when creating a day-precise promotion it's
          // just the nearest whole-month approximation for legacy display
          // sites; durationDays is what actually drives the Finix trial.
          durationMonths: durationUnit === "days" ? Math.max(1, Math.round(parseInt(durationDays, 10) / 30)) : parseInt(durationMonths, 10),
          durationDays: durationUnit === "days" ? parseInt(durationDays, 10) : null,
          normalMonthlyAmountCents: Math.round(parseFloat(normalAmount) * 100),
          promotionWaivesPlatformFee: waivesPlatformFee,
          confirmed: true,
          reason,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create promotion");
      toast.success("Promotion created.");
      setShowForm(false);
      setConfirmed(false);
      setReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create promotion");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (promo: PromotionRow) => {
    if (!toggleConfirmed) {
      toast.error("Confirmation is required.");
      return;
    }
    if (!toggleReason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/promotions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId: promo.id, active: !promo.active, confirmed: true, reason: toggleReason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update promotion");
      toast.success(promo.active ? "Promotion deactivated." : "Promotion reactivated.");
      setTogglingId(null);
      setToggleReason("");
      setToggleConfirmed(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update promotion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Promotion Templates</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Promotions are never deleted — only deactivated. Deactivating stops new grants; already-granted entitlements are unaffected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvLink type="current-client-grants" />
          <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold">
            {showForm ? "Cancel" : "New Promotion"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Customer-facing description</label>
            <textarea value={customerDescription} onChange={(e) => setCustomerDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Duration</label>
              <div className="flex gap-2">
                <input
                  value={durationUnit === "days" ? durationDays : durationMonths}
                  onChange={(e) => (durationUnit === "days" ? setDurationDays(e.target.value) : setDurationMonths(e.target.value))}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "months" | "days")} className="px-2 py-2 rounded-lg border border-slate-200 text-sm">
                  <option value="months">months</option>
                  <option value="days">days</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Normal monthly amount ($)</label>
              <input value={normalAmount} onChange={(e) => setNormalAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={waivesPlatformFee} onChange={(e) => setWaivesPlatformFee(e.target.checked)} />
            Waives platform fee during the promotion
          </label>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (internal)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Impact preview:</strong> creates a new promotion template “{name || code}” — {durationUnit === "days" ? `${durationDays} day(s)` : `${durationMonths} month(s)`} at $
            {normalAmount} normal price. No organization is affected until this template is explicitly granted to one.
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            I confirm this new promotion template.
          </label>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Creating…" : "Create Promotion"}
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Code</th>
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Duration</th>
            <th className="text-left py-2">Normal Price</th>
            <th className="text-left py-2">Active</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {promotions.map((p) => (
            <tr key={p.id}>
              <td className="py-2 font-medium text-slate-800">{p.code}</td>
              <td className="py-2">{p.name}</td>
              <td className="py-2">{p.durationDays != null ? `${p.durationDays} days` : `${p.durationMonths} mo`}</td>
              <td className="py-2">{cents(p.normalMonthlyAmountCents)}</td>
              <td className="py-2">{p.active ? "Yes" : "No"}</td>
              <td className="py-2 text-right space-x-3">
                <button onClick={() => setViewingEntitlementsFor(p)} className="text-blue-600 font-semibold hover:underline">
                  Grants
                </button>
                <button onClick={() => setGrantingPromotion(p)} className="text-blue-600 font-semibold hover:underline">
                  Grant to Org
                </button>
                <button onClick={() => setTogglingId(p.id)} className="text-slate-600 font-semibold hover:underline">
                  {p.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
          {!loading && promotions.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-slate-400">No promotions yet.</td></tr>
          )}
        </tbody>
      </table>

      {togglingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {promotions.find((p) => p.id === togglingId)?.active ? "Deactivate" : "Reactivate"} Promotion
            </h3>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (required)</label>
            <textarea value={toggleReason} onChange={(e) => setToggleReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />
            <label className="flex items-start gap-2 text-xs text-slate-600 mb-4">
              <input type="checkbox" checked={toggleConfirmed} onChange={(e) => setToggleConfirmed(e.target.checked)} className="mt-0.5" />
              I confirm this status change.
            </label>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setTogglingId(null); setToggleReason(""); setToggleConfirmed(false); }} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={() => {
                  const promo = promotions.find((p) => p.id === togglingId);
                  if (promo) toggleActive(promo);
                }}
                disabled={submitting}
                className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {grantingPromotion && (
        <GrantPromotionModal promotion={grantingPromotion} onClose={() => setGrantingPromotion(null)} onDone={() => { setGrantingPromotion(null); load(); }} />
      )}
      {viewingEntitlementsFor && (
        <PromotionEntitlementsModal promotion={viewingEntitlementsFor} onClose={() => setViewingEntitlementsFor(null)} />
      )}
    </div>
  );
}

function GrantPromotionModal({ promotion, onClose, onDone }: { promotion: PromotionRow; onClose: () => void; onDone: () => void }) {
  const [organizationId, setOrganizationId] = useState("");
  const [customerFacingExplanation, setCustomerFacingExplanation] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!organizationId.trim()) {
      toast.error("An organization ID is required.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm this grant.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/promotions/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, promotionId: promotion.id, customerFacingExplanation, confirmed: true, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to grant promotion");
      toast.success(`${promotion.name} granted.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant promotion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Grant “{promotion.name}”</h3>
        <p className="text-sm text-slate-500 mb-4">{promotion.durationDays != null ? `${promotion.durationDays} day(s)` : `${promotion.durationMonths} month(s)`} at {cents(promotion.normalMonthlyAmountCents)} normal price.</p>

        <label className="block text-xs font-semibold text-slate-500 mb-1">Organization ID</label>
        <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />

        <label className="block text-xs font-semibold text-slate-500 mb-1">Internal reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />

        <label className="block text-xs font-semibold text-slate-500 mb-1">Customer-facing explanation</label>
        <textarea value={customerFacingExplanation} onChange={(e) => setCustomerFacingExplanation(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4" />

        <label className="flex items-start gap-2 text-xs text-slate-600 mb-4">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm I am authorized to grant this promotion to this organization.
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Granting…" : "Grant"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromotionEntitlementsModal({ promotion, onClose }: { promotion: PromotionRow; onClose: () => void }) {
  const [entitlements, setEntitlements] = useState<PromotionEntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<PromotionEntitlementRow | null>(null);

  const load = () => {
    fetch(`/api/admin/billing/promotions/${promotion.id}/entitlements`)
      .then((r) => r.json())
      .then((d) => setEntitlements(d.entitlements || []))
      .catch(() => toast.error("Failed to load grants"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Grants of “{promotion.name}”</h3>
          <button onClick={onClose} className="text-sm font-semibold text-slate-600 hover:underline">Close</button>
        </div>

        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 uppercase">
            <tr>
              <th className="text-left py-2">Organization</th>
              <th className="text-left py-2">Source</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Granted</th>
              <th className="text-left py-2">Ends</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entitlements.map((e) => (
              <tr key={e.id}>
                <td className="py-2 font-medium text-slate-800">{e.organizationName || e.organizationId}</td>
                <td className="py-2 text-slate-500">{e.source}</td>
                <td className="py-2 text-slate-500">{e.status}</td>
                <td className="py-2 text-slate-500">{fmt(e.grantedAt)}</td>
                <td className="py-2 text-slate-500">{fmt(e.endsAt)}</td>
                <td className="py-2 text-right">
                  {e.status !== "CANCELED" && (
                    <button onClick={() => setActingOn(e)} className="text-blue-600 font-semibold hover:underline">
                      Extend / Shorten / Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && entitlements.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No grants yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {actingOn && (
        <EntitlementActionModal
          entitlement={actingOn}
          onClose={() => setActingOn(null)}
          onDone={() => {
            setActingOn(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EntitlementActionModal({ entitlement, onClose, onDone }: { entitlement: PromotionEntitlementRow; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<"extend" | "shorten" | "cancel">("extend");
  const [newEndsAt, setNewEndsAt] = useState(entitlement.endsAt ? entitlement.endsAt.slice(0, 10) : "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm this action.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/billing/promotions/entitlements/${entitlement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, newEndsAt: action === "cancel" ? undefined : newEndsAt, confirmed: true, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update grant");
      toast.success("Grant updated.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update grant");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Update Grant</h3>

        <label className="block text-xs font-semibold text-slate-500 mb-1">Action</label>
        <select value={action} onChange={(e) => setAction(e.target.value as "extend" | "shorten" | "cancel")} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3">
          <option value="extend">Extend</option>
          <option value="shorten">Shorten</option>
          <option value="cancel">Cancel</option>
        </select>

        {action !== "cancel" && (
          <>
            <label className="block text-xs font-semibold text-slate-500 mb-1">New end date</label>
            <input type="date" value={newEndsAt} onChange={(e) => setNewEndsAt(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3" />
          </>
        )}

        <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (required)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4" />

        <label className="flex items-start gap-2 text-xs text-slate-600 mb-4">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm this change to the organization&apos;s promotion grant.
        </label>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FailedPaymentsTab() {
  const [charges, setCharges] = useState<FailedPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    fetch(`/api/admin/billing/failed-payments?page=${page}`)
      .then((r) => r.json())
      .then((d) => {
        setCharges(d.charges || []);
        setTotal(d.total || 0);
      })
      .catch(() => toast.error("Failed to load failed payments"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Failed Payments</h3>
          <p className="text-xs text-slate-400 mt-0.5">Read-only. Retries are Finix/webhook-driven, not admin-triggered.</p>
        </div>
        <ExportCsvLink type="failed-payments" />
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Organization</th>
            <th className="text-left py-2">Type</th>
            <th className="text-left py-2">Amount</th>
            <th className="text-left py-2">Failure Code</th>
            <th className="text-left py-2">Failure Message</th>
            <th className="text-left py-2">Attempted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {charges.map((c) => (
            <tr key={c.id}>
              <td className="py-2 font-medium text-slate-800">
                {c.organizationName ? (
                  <a href={`/admin/organizations/${c.organizationId}`} className="text-blue-600 hover:underline">{c.organizationName}</a>
                ) : (
                  c.organizationId
                )}
              </td>
              <td className="py-2 text-slate-500">{c.chargeType}</td>
              <td className="py-2 text-slate-500">{cents(c.amountCents)}</td>
              <td className="py-2 text-slate-500">{c.failureCode || "—"}</td>
              <td className="py-2 text-slate-500">{c.failureMessage || "—"}</td>
              <td className="py-2 text-slate-500">{fmt(c.attemptedAt)}</td>
            </tr>
          ))}
          {!loading && charges.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-slate-400">No failed payments.</td></tr>
          )}
        </tbody>
      </table>

      {total > 50 && (
        <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30">Previous</button>
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<BillingSettingsRow | null>(null);
  const [gracePeriodDays, setGracePeriodDays] = useState("14");
  const [pastDueReminderDays, setPastDueReminderDays] = useState("1,3,7,12");
  const [trialEndingReminderDays, setTrialEndingReminderDays] = useState("14,3,1");
  const [restrictedFeatureKeys, setRestrictedFeatureKeys] = useState("");
  const [supportContactEmail, setSupportContactEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch("/api/admin/billing/settings")
      .then((r) => r.json())
      .then((d) => {
        const s: BillingSettingsRow = d.settings;
        setSettings(s);
        setGracePeriodDays(String(s.gracePeriodDays));
        setPastDueReminderDays(s.pastDueReminderDays.join(","));
        setTrialEndingReminderDays(s.trialEndingReminderDays.join(","));
        setRestrictedFeatureKeys(s.restrictedFeatureKeys.join(","));
        setSupportContactEmail(s.supportContactEmail || "");
      })
      .catch(() => toast.error("Failed to load billing settings"));
  };
  useEffect(() => {
    load();
  }, []);

  const parseDays = (s: string): number[] =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => parseInt(v, 10))
      .filter((n) => Number.isFinite(n));

  const parseKeys = (s: string): string[] =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

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
      const res = await fetch("/api/admin/billing/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gracePeriodDays: parseInt(gracePeriodDays, 10),
          pastDueReminderDays: parseDays(pastDueReminderDays),
          trialEndingReminderDays: parseDays(trialEndingReminderDays),
          restrictedFeatureKeys: parseKeys(restrictedFeatureKeys),
          supportContactEmail: supportContactEmail || null,
          confirmed: true,
          reason,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update settings");
      toast.success("Billing settings updated.");
      setConfirmed(false);
      setReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Billing Settings</h3>
      <p className="text-xs text-slate-400 mb-4">
        Changes apply going forward only — never retroactively to already-computed gracePeriodEndsAt values on existing subscriptions.
        {settings && ` Last updated ${fmt(settings.updatedAt)}.`}
      </p>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Grace period (days)</label>
          <input value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Past-due reminder days (comma-separated)</label>
          <input value={pastDueReminderDays} onChange={(e) => setPastDueReminderDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Trial-ending reminder days (comma-separated)</label>
          <input value={trialEndingReminderDays} onChange={(e) => setTrialEndingReminderDays(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Restricted feature keys (comma-separated)</label>
          <input value={restrictedFeatureKeys} onChange={(e) => setRestrictedFeatureKeys(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Support contact email</label>
          <input value={supportContactEmail} onChange={(e) => setSupportContactEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (required)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>Impact preview:</strong> grace period will change to {gracePeriodDays} day(s). Applies to future access-gate calculations only.
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm this billing settings change.
        </label>
        <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

const TERMS_TYPES = ["SUBSCRIPTION_TERMS", "CANCELLATION_POLICY", "BILLING_AUTHORIZATION", "PROMOTION_TERMS", "INVOICE_BILLING_TERMS"] as const;

function TermsTab() {
  const [termsType, setTermsType] = useState<(typeof TERMS_TYPES)[number]>("SUBSCRIPTION_TERMS");
  const [current, setCurrent] = useState<TermsVersionRow | null>(null);
  const [history, setHistory] = useState<TermsVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch(`/api/admin/billing/terms?type=${termsType}`)
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.current);
        setHistory(d.history || []);
      })
      .catch(() => toast.error("Failed to load terms"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsType]);

  const submit = async () => {
    if (!version.trim()) {
      toast.error("A version string is required.");
      return;
    }
    if (!bodyMarkdown.trim()) {
      toast.error("Body text is required.");
      return;
    }
    if (!confirmed) {
      toast.error("Confirmation is required to publish a new terms version.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/billing/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termsType, version, bodyMarkdown, confirmed: true, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to publish terms version");
      toast.success(`Published ${termsType} ${version}.`);
      setVersion("");
      setBodyMarkdown("");
      setConfirmed(false);
      setReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish terms version");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Legal Terms</h3>
      <p className="text-xs text-slate-400 mb-4">
        Versions are permanent — a published version is never edited in place. Accepted authorizations permanently reference the version
        they accepted, even after a newer version publishes.
      </p>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-slate-500 mb-1">Terms Type</label>
        <select value={termsType} onChange={(e) => setTermsType(e.target.value as (typeof TERMS_TYPES)[number])} className="w-full max-w-sm px-3 py-2 rounded-lg border border-slate-200 text-sm">
          {TERMS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Current version: <strong>{current ? current.version : "None published yet"}</strong>
      </p>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3 mb-6">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">New version string (e.g. &quot;v2&quot;)</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Body (markdown)</label>
          <textarea value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} rows={8} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Reason (internal)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>Impact preview:</strong> publishes a NEW {termsType} version “{version || "…"}”. Existing accepted authorizations keep
          referencing their original version — nothing is retroactively changed.
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          I confirm this new terms version is ready to publish.
        </label>
        <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? "Publishing…" : "Publish New Version"}
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Version</th>
            <th className="text-left py-2">Published</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {history.map((h) => (
            <tr key={h.id}>
              <td className="py-2 font-medium text-slate-800">{h.version}</td>
              <td className="py-2 text-slate-500">{fmt(h.publishedAt)}</td>
            </tr>
          ))}
          {!loading && history.length === 0 && (
            <tr><td colSpan={2} className="py-6 text-center text-slate-400">No versions published yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [organizationId, setOrganizationId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => {
    const params = new URLSearchParams({ page: String(page) });
    if (organizationId) params.set("organizationId", organizationId);
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    fetch(`/api/admin/billing/audit-log?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries || []);
        setTotal(d.total || 0);
      })
      .catch(() => toast.error("Failed to load audit log"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const applyFilters = () => {
    setPage(1);
    load();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">Billing Audit Log</h3>
        <ExportCsvLink type="audit-history" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <input placeholder="Organization ID" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        <input placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        <input placeholder="Entity Type" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
      </div>
      <button onClick={applyFilters} className="mb-4 px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Apply Filters
      </button>

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400 uppercase">
          <tr>
            <th className="text-left py-2">Actor</th>
            <th className="text-left py-2">Action</th>
            <th className="text-left py-2">Entity</th>
            <th className="text-left py-2">Reason</th>
            <th className="text-left py-2">Timestamp</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <Fragment key={e.id}>
              <tr>
                <td className="py-2 text-slate-600">{e.actorEmail || "System"}</td>
                <td className="py-2 font-medium text-slate-800">{e.action}</td>
                <td className="py-2 text-slate-500">{e.entityType ? `${e.entityType}${e.entityId ? ` (${e.entityId})` : ""}` : "—"}</td>
                <td className="py-2 text-slate-500">{e.internalReason || "—"}</td>
                <td className="py-2 text-slate-500">{fmt(e.createdAt)}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} className="text-blue-600 font-semibold hover:underline">
                    {expandedId === e.id ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>
              {expandedId === e.id && (
                <tr>
                  <td colSpan={6} className="py-3 px-2 bg-slate-50">
                    <pre className="text-xs whitespace-pre-wrap text-slate-600">
                      {JSON.stringify({ previousValue: e.previousValue, newValue: e.newValue }, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!loading && entries.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-slate-400">No audit entries yet.</td></tr>
          )}
        </tbody>
      </table>

      {total > 50 && (
        <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30">Previous</button>
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
interface WgcProfitByOrg {
  churchId: string;
  churchName: string;
  paymentCount: number;
  wgcChargedCents: number;
  finixCostCents: number;
  profitCents: number;
}

interface WgcProfitSummaryResponse {
  rangeFrom: string;
  rangeTo: string;
  paymentCount: number;
  wgcChargedCents: number;
  finixCostCents: number;
  profitCents: number;
  paymentsMissingFeeDataCount: number;
  byOrganization: WgcProfitByOrg[];
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * WGC-staff-only view: (what WGC charged) minus (what Finix actually
 * charged WGC) — see src/lib/reports/wgcProfit.ts for exactly how this
 * differs from Payment.actualFinixFeesCents and why. Never reachable from
 * any merchant-facing route.
 */
function WgcProfitTab() {
  const [summary, setSummary] = useState<WgcProfitSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => isoDate(new Date()));

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/billing/wgc-profit?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setSummary(d.summary || null))
      .catch(() => toast.error("Failed to load WGC profit report"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-4">
        Internal only — never shown to organizations. Finix cost is only as complete as what&apos;s been synced from Finix&apos;s Fees
        API; payments with no synced fee data yet count as $0 Finix cost below (see the missing-data count), which overstates profit
        until that data lands.
      </div>

      <div className="flex items-end gap-3 mb-6">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">WGC Charged</div>
              <div className="text-xl font-bold text-slate-900">{cents(summary.wgcChargedCents)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">Finix Cost</div>
              <div className="text-xl font-bold text-slate-900">{cents(summary.finixCostCents)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">WGC Profit</div>
              <div className={`text-xl font-bold ${summary.profitCents >= 0 ? "text-emerald-700" : "text-red-600"}`}>{cents(summary.profitCents)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="text-xs text-slate-500 mb-1">Payments / Missing Fee Data</div>
              <div className="text-xl font-bold text-slate-900">
                {summary.paymentCount} <span className="text-sm font-normal text-slate-400">/ {summary.paymentsMissingFeeDataCount}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Organization</th>
                  <th className="text-right px-4 py-3">Payments</th>
                  <th className="text-right px-4 py-3">WGC Charged</th>
                  <th className="text-right px-4 py-3">Finix Cost</th>
                  <th className="text-right px-4 py-3">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.byOrganization.map((o) => (
                  <tr key={o.churchId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{o.churchName}</td>
                    <td className="px-4 py-2 text-right">{o.paymentCount}</td>
                    <td className="px-4 py-2 text-right">{cents(o.wgcChargedCents)}</td>
                    <td className="px-4 py-2 text-right">{cents(o.finixCostCents)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${o.profitCents >= 0 ? "text-emerald-700" : "text-red-600"}`}>{cents(o.profitCents)}</td>
                  </tr>
                ))}
                {summary.byOrganization.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">No successful payments in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
