"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

interface TrialMissingDatesRow {
  subscriptionId: string;
  organizationId: string;
  organizationName: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}
interface FailedChargeRow {
  chargeId: string;
  organizationId: string;
  organizationName: string | null;
  billingPeriod: string | null;
  amountCents: number;
  failureCode: string | null;
  failureMessage: string | null;
  attemptedAt: string;
}
interface RetryGroupRow {
  organizationId: string;
  organizationName: string | null;
  billingPeriod: string | null;
  failedCount: number;
}
interface AuditFlagRow {
  auditLogId: string;
  organizationId: string | null;
  organizationName: string | null;
  subscriptionId: string | null;
  detail: string | null;
  createdAt: string;
}
interface UnprocessedWebhookRow {
  webhookEventId: string;
  finixEventId: string;
  type: string;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: string;
}
interface StalePastDueRow {
  subscriptionId: string;
  organizationId: string;
  organizationName: string | null;
  pastDueAt: string | null;
  gracePeriodEndsAt: string | null;
}
interface MissingBillingInstrumentRow {
  organizationId: string;
  organizationName: string | null;
  reason: "NO_PAYMENT_INSTRUMENT" | "NO_BILLING_ACCOUNT";
  billingAccountStatus: string | null;
}
interface PromotionEndingSoonRow {
  entitlementId: string;
  organizationId: string;
  organizationName: string | null;
  source: string;
  endsAt: string | null;
}
interface OrgWaitingForBillingSetupRow {
  organizationId: string;
  organizationName: string | null;
  billingSetupStatus: string | null;
  subscriptionStatus: string | null;
}

interface BillingMonitoringSnapshot {
  trialsMissingFinixDates: TrialMissingDatesRow[];
  failedCharges: FailedChargeRow[];
  retryGroups: RetryGroupRow[];
  routingMismatches: AuditFlagRow[];
  unprocessedWebhooks: UnprocessedWebhookRow[];
  stalePastDue: StalePastDueRow[];
  missingBillingInstruments: MissingBillingInstrumentRow[];
  duplicateReferences: AuditFlagRow[];
  promotionsEndingSoon: PromotionEndingSoonRow[];
  orgsWaitingForBillingSetup: OrgWaitingForBillingSetupRow[];
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString() : "—";
}

function cents(c: number | undefined) {
  return c != null ? `$${(c / 100).toFixed(2)}` : "—";
}

function orgLabel(name: string | null, id: string | null) {
  return name || id || "—";
}

function Section({ title, description, count, children }: { title: string; description: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-1">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-slate-400 text-sm">
        Nothing to review.
      </td>
    </tr>
  );
}

export default function MonitoringClient() {
  const [data, setData] = useState<BillingMonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/billing/monitoring")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => toast.error("Failed to load billing monitoring data"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">Billing Monitoring</h1>
        <Link
          href="/admin/billing"
          className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Go to Billing Dashboard
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Read-only visibility into what needs manual attention. Nothing here can be fixed from this page — use the Billing Dashboard&apos;s
        &quot;Reconcile Now&quot; for the one legitimate correction action.
      </p>

      {loading && <p className="text-sm text-slate-400 mb-6">Loading…</p>}

      {data && (
        <>
          <Section
            title="Trial Subscriptions Missing Finix Dates"
            description="TRIALING subscriptions with no trialStartsAt or trialEndsAt."
            count={data.trialsMissingFinixDates.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Trial Starts</th>
                  <th className="text-left px-4 py-2">Trial Ends</th>
                  <th className="text-left px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.trialsMissingFinixDates.map((r) => (
                  <tr key={r.subscriptionId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.trialStartsAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.trialEndsAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {data.trialsMissingFinixDates.length === 0 && <Empty colSpan={4} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Failed Subscription Charges"
            description="Most recent WGC_PLATFORM_SUBSCRIPTION charges with status FAILED."
            count={data.failedCharges.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Period</th>
                  <th className="text-left px-4 py-2">Amount</th>
                  <th className="text-left px-4 py-2">Failure</th>
                  <th className="text-left px-4 py-2">Attempted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.failedCharges.map((r) => (
                  <tr key={r.chargeId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.billingPeriod || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{cents(r.amountCents)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.failureCode || r.failureMessage || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.attemptedAt)}</td>
                  </tr>
                ))}
                {data.failedCharges.length === 0 && <Empty colSpan={5} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Finix Retry Results"
            description="Failed charges grouped by organization and billing period (repeated FAILED rows in the same period are this system's only record of retry attempts)."
            count={data.retryGroups.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Period</th>
                  <th className="text-left px-4 py-2">Failed Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.retryGroups.map((r) => (
                  <tr key={`${r.organizationId}-${r.billingPeriod}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.billingPeriod || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{r.failedCount}</td>
                  </tr>
                ))}
                {data.retryGroups.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Merchant-Routing Mismatches"
            description="reconciliation.critical_flag audit entries for MERCHANT_ROUTING_MISMATCH — from the last reconciliation run, never re-computed on load."
            count={data.routingMismatches.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Detail</th>
                  <th className="text-left px-4 py-2">Flagged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.routingMismatches.map((r) => (
                  <tr key={r.auditLogId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.detail || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {data.routingMismatches.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Unprocessed Webhooks"
            description="FinixWebhookEvent rows not in a COMPLETED processingStatus."
            count={data.unprocessedWebhooks.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Error</th>
                  <th className="text-left px-4 py-2">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.unprocessedWebhooks.map((r) => (
                  <tr key={r.webhookEventId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.type}</td>
                    <td className="px-4 py-2 text-slate-500">{r.processingStatus}</td>
                    <td className="px-4 py-2 text-slate-500">{r.errorMessage || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {data.unprocessedWebhooks.length === 0 && <Empty colSpan={4} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Stale Past-Due Accounts"
            description="PAST_DUE subscriptions unresolved for over 30 days (same threshold as subscriptionReconciliation.ts)."
            count={data.stalePastDue.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Past Due Since</th>
                  <th className="text-left px-4 py-2">Grace Period Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.stalePastDue.map((r) => (
                  <tr key={r.subscriptionId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.pastDueAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.gracePeriodEndsAt)}</td>
                  </tr>
                ))}
                {data.stalePastDue.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Missing Billing Instruments"
            description="WgcBillingAccount rows with no payment instrument, or organizations with a subscription but no billing account at all."
            count={data.missingBillingInstruments.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Reason</th>
                  <th className="text-left px-4 py-2">Billing Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.missingBillingInstruments.map((r) => (
                  <tr key={`${r.organizationId}-${r.reason}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.reason === "NO_BILLING_ACCOUNT" ? "No billing account row" : "No payment instrument on file"}</td>
                    <td className="px-4 py-2 text-slate-500">{r.billingAccountStatus || "—"}</td>
                  </tr>
                ))}
                {data.missingBillingInstruments.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Duplicate Subscription References"
            description="reconciliation.critical_flag audit entries for DUPLICATE_SUBSCRIPTION_REFERENCE."
            count={data.duplicateReferences.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Detail</th>
                  <th className="text-left px-4 py-2">Flagged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.duplicateReferences.map((r) => (
                  <tr key={r.auditLogId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.detail || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {data.duplicateReferences.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Promotions Ending Soon"
            description="ACTIVE promotion entitlements ending within the next 14 days."
            count={data.promotionsEndingSoon.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.promotionsEndingSoon.map((r) => (
                  <tr key={r.entitlementId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.source}</td>
                    <td className="px-4 py-2 text-slate-500">{fmt(r.endsAt)}</td>
                  </tr>
                ))}
                {data.promotionsEndingSoon.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>

          <Section
            title="Organizations Waiting for Billing Setup"
            description="Churches approved but not billing-active with no subscription yet, or subscriptions stuck INCOMPLETE."
            count={data.orgsWaitingForBillingSetup.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Organization</th>
                  <th className="text-left px-4 py-2">Billing Setup Status</th>
                  <th className="text-left px-4 py-2">Subscription Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.orgsWaitingForBillingSetup.map((r) => (
                  <tr key={r.organizationId}>
                    <td className="px-4 py-2 font-medium text-slate-800">{orgLabel(r.organizationName, r.organizationId)}</td>
                    <td className="px-4 py-2 text-slate-500">{r.billingSetupStatus || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{r.subscriptionStatus || "None"}</td>
                  </tr>
                ))}
                {data.orgsWaitingForBillingSetup.length === 0 && <Empty colSpan={3} />}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}
