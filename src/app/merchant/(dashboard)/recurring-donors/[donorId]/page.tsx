import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatDateCDT, formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import Pagination from "@/components/merchant/Pagination";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { loadDonorInstrumentIds, loadDonorGivingLinksTab, loadDonorRefundsTab, loadDonorBankReturnsTab, loadDonorDisputesTab, loadDonorActivityTab } from "@/lib/donors/donorTabs";
import { loadRecurringPaymentsForDonor, loadUnattributedRecurringCandidates } from "@/lib/subscriptions/recurringDonorPayments";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds, resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "payments", label: "Recurring Payments" },
  { key: "payment-methods", label: "Payment Methods" },
  { key: "giving-links", label: "Giving Links" },
  { key: "refunds", label: "Refunds" },
  { key: "bank-returns", label: "Bank Returns" },
  { key: "disputes", label: "Disputes" },
  { key: "activity", label: "Activity" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const PAYMENTS_PAGE_SIZE = 25;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default async function RecurringDonorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ donorId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  // Team-access Checkpoint 4C: migrated off getSession() to
  // requireMerchantSession() — this page previously showed a donor's full
  // recurring-giving history (payments, giving links, refunds, disputes,
  // activity) with no donor-qualification gate and no per-tab attribution
  // scoping at all.
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const churchId = auth.churchId;
  const permissions = getSubscriptionPermissions(auth.rawRole);
  const { donorId } = await params;
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "overview") as TabKey;

  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  if (scopedDonorIds !== null && !scopedDonorIds.includes(donorId)) notFound();
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) notFound();

  const subscriptions = await loadSubscriptionCandidates(churchId, { donorId, attributedUserId: scopedUserId });
  if (subscriptions.length === 0) notFound();

  const active = subscriptions.filter((s) => s.displayStatus === "ACTIVE");
  const monthlyValueCents = active.reduce((sum, s) => sum + s.monthlyValueCents, 0);
  const nextBillingDate = active.map((s) => s.nextBillingDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastPayment = subscriptions.map((s) => s.lastPayment).filter((p): p is { date: Date; amountCents: number; state: string } => !!p).sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
  const lifetimeCents = subscriptions.reduce((sum, s) => sum + s.lifetimeCollectedCents, 0);
  const attentionReasons = [...new Set(subscriptions.flatMap((s) => s.attentionReasons))];
  const overallStatus = active.length > 0 ? (subscriptions.length > active.length ? "MIXED" : "ACTIVE") : subscriptions.some((s) => s.displayStatus === "PAST_DUE") ? "PAST_DUE" : "CANCELED";
  const donorName = donor.anonymousPreference ? "Anonymous Donor" : donor.name || "—";

  const tabLink = (key: TabKey) => `/merchant/recurring-donors/${donorId}?tab=${key}`;

  return (
    <div>
      <div className="mb-6">
        <Link href="/merchant/recurring-donors" className="text-sm font-semibold text-blue-600 hover:underline">
          ← All Recurring Donors
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Recurring Donor</p>
            <h1 className="text-2xl font-bold text-slate-900">{donorName}</h1>
            <p className="text-sm text-slate-500">{donor.email || "No email on file"}{donor.phone ? ` · ${donor.phone}` : ""}</p>
          </div>
          <StateBadge state={overallStatus} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Monthly Recurring Value</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(monthlyValueCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Annualized Value</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(monthlyValueCents * 12)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Active Subscriptions</p>
            <p className="text-lg font-bold text-slate-900">{active.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Next Billing Date</p>
            <p className="text-lg font-bold text-slate-900">{nextBillingDate ? formatDateCDT(nextBillingDate) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Last Payment</p>
            <p className="text-sm font-semibold text-slate-700">{lastPayment ? `${formatCents(lastPayment.amountCents)} · ${formatDateCDT(lastPayment.date)}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Lifetime Recurring Donated</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(lifetimeCents)}</p>
          </div>
        </div>
      </div>

      {attentionReasons.length > 0 && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{attentionReasons.join(" · ")}</p>
        </div>
      )}

      <div className="flex items-center gap-1 mb-6 border-b border-slate-100 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabLink(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && <OverviewTab subscriptions={subscriptions} donor={donor} />}
      {tab === "subscriptions" && <SubscriptionsTab subscriptions={subscriptions} />}
      {tab === "payments" && (
        <PaymentsTab
          donorId={donorId}
          churchId={churchId}
          page={Math.max(1, parseInt(sp.page || "1", 10) || 1)}
          canReconcileUnattributed={permissions.canReconcileUnattributed}
          scopedUserId={scopedUserId}
        />
      )}
      {tab === "payment-methods" && <PaymentMethodsTab donorId={donorId} churchId={churchId} />}
      {tab === "giving-links" && <GivingLinksTab donorId={donorId} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "refunds" && <RefundsTab donorId={donorId} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "bank-returns" && <BankReturnsTab donorId={donorId} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "disputes" && <DisputesTab donorId={donorId} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "activity" && <ActivityTab donorId={donorId} churchId={churchId} donor={donor} scopedUserId={scopedUserId} />}
    </div>
  );
}

function OverviewTab({ subscriptions, donor }: { subscriptions: Awaited<ReturnType<typeof loadSubscriptionCandidates>>; donor: any }) {
  const active = subscriptions.filter((s) => s.displayStatus === "ACTIVE");
  const frequencyBreakdown = new Map<string, number>();
  for (const s of active) frequencyBreakdown.set(frequencyLabel(s.billingInterval), (frequencyBreakdown.get(frequencyLabel(s.billingInterval)) || 0) + 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card title="Active Subscriptions">
          {active.length === 0 ? (
            <p className="text-sm text-slate-500">No active recurring donation schedules.</p>
          ) : (
            <div className="space-y-3">
              {active.map((s) => (
                <Link key={s.id} href={`/merchant/subscriptions/${s.id}`} className="flex items-center justify-between text-sm hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg">
                  <div>
                    <p className="text-slate-700">{frequencyLabel(s.billingInterval)}</p>
                    <p className="text-xs text-slate-400">Next: {s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</p>
                  </div>
                  <p className="font-semibold text-slate-900">{formatCents(s.amountCents)}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card title="Frequency Breakdown">
          {frequencyBreakdown.size === 0 ? (
            <p className="text-sm text-slate-500">No active recurring donations.</p>
          ) : (
            <div className="space-y-2">
              {[...frequencyBreakdown.entries()].map(([label, count]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold text-slate-800">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Recent Recurring Payments">
          {subscriptions.every((s) => !s.lastPayment) ? (
            <p className="text-sm text-slate-500">Payments generated by this donor's recurring donation schedules will appear here.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions
                .filter((s) => s.lastPayment)
                .sort((a, b) => b.lastPayment!.date.getTime() - a.lastPayment!.date.getTime())
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <p className="text-slate-600">{formatDateCDT(s.lastPayment!.date)}</p>
                    <p className="font-semibold text-slate-900">{formatCents(s.lastPayment!.amountCents)}</p>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Contact Information">
          <div className="space-y-1.5 text-sm">
            <p className="text-slate-600">Email: {donor.email || "—"}</p>
            <p className="text-slate-600">Phone: {donor.phone || "—"}</p>
            {(donor.city || donor.state) && <p className="text-slate-600">{[donor.city, donor.state].filter(Boolean).join(", ")}</p>}
          </div>
        </Card>
        <Card title="Primary Payment Method">
          {subscriptions[0]?.paymentMethod ? (
            <p className="text-sm text-slate-700">
              {subscriptions[0].paymentMethod.brand || "Bank Account"} •••• {subscriptions[0].paymentMethod.last4 || "—"}
            </p>
          ) : (
            <p className="text-sm text-slate-500">No payment method on file.</p>
          )}
        </Card>
        <Card title="Related Donor Profile">
          <Link href={`/merchant/donors/${donor.id}`} className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
            View Full Donor Profile <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </Card>
      </div>
    </div>
  );
}

function SubscriptionsTab({ subscriptions }: { subscriptions: Awaited<ReturnType<typeof loadSubscriptionCandidates>> }) {
  return (
    <Card title="Subscriptions">
      {subscriptions.length === 0 ? (
        <p className="text-sm text-slate-500">No subscriptions</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Subscription ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Frequency</th>
                <th className="py-2 pr-4 text-right">Monthly Value</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Next Billing</th>
                <th className="py-2 pr-4 text-right">Failed</th>
                <th className="py-2 pr-4 text-right">Lifetime Collected</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/merchant/subscriptions/${s.id}`} className="text-blue-600 hover:underline">
                      <CopyableIdBadge id={s.finixSubscriptionId} />
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(s.amountCents)}</td>
                  <td className="py-2 pr-4 text-slate-600">{frequencyLabel(s.billingInterval)}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{formatCents(s.monthlyValueCents)}</td>
                  <td className="py-2 pr-4"><StateBadge state={s.displayStatus} /></td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{s.failedAttempts}</td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(s.lifetimeCollectedCents)}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{formatDateTime(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function PaymentsTab({
  donorId,
  churchId,
  page,
  canReconcileUnattributed,
  scopedUserId,
}: {
  donorId: string;
  churchId: string;
  page: number;
  canReconcileUnattributed: boolean;
  scopedUserId?: string;
}) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const [{ rows, totalCount }, unattributed] = await Promise.all([
    loadRecurringPaymentsForDonor(instrumentIds, churchId, page, PAYMENTS_PAGE_SIZE, scopedUserId),
    canReconcileUnattributed && !scopedUserId ? loadUnattributedRecurringCandidates(instrumentIds, churchId) : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAYMENTS_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card title="Recurring Payments">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Payments generated by this recurring donation schedule will appear here.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-2 pr-4">Payment ID</th>
                    <th className="py-2 pr-4">Subscription ID</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Refund</th>
                    <th className="py-2 pr-4">ACH Return</th>
                    <th className="py-2">Dispute</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ transfer, refunded, achReturned, disputed }) => (
                    <tr key={transfer.id} className="border-t border-slate-50">
                      <td className="py-2 pr-4">
                        <Link href={`/merchant/transactions/payments?id=${transfer.finixTransferId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                          {transfer.finixTransferId}
                        </Link>
                      </td>
                      <td className="py-2 pr-4"><CopyableIdBadge id={transfer.finixSubscriptionId!} /></td>
                      <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(transfer.createdAtFinix)}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(transfer.amountCents ?? 0)}</td>
                      <td className="py-2 pr-4"><StateBadge state={transfer.state} /></td>
                      <td className="py-2 pr-4 text-slate-500">{refunded ? "Yes" : "—"}</td>
                      <td className="py-2 pr-4 text-slate-500">{achReturned ? "Yes" : "—"}</td>
                      <td className="py-2 text-slate-500">{disputed ? "Yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && <div className="mt-4"><Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAYMENTS_PAGE_SIZE} /></div>}
          </>
        )}
      </Card>

      {canReconcileUnattributed && unattributed.length > 0 && (
        <Card title="Unattributed Recurring Candidates">
          <p className="text-xs text-slate-500 mb-3">
            These transfers are tagged by Finix as subscription-originated but have no verified link to a specific subscription. They are not included in confirmed recurring totals.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="py-2 pr-4">Payment ID</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {unattributed.map((t) => (
                  <tr key={t.id} className="border-t border-slate-50">
                    <td className="py-2 pr-4 text-xs">{t.finixTransferId}</td>
                    <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(t.createdAtFinix)}</td>
                    <td className="py-2 text-right font-semibold text-slate-900">{formatCents(t.amountCents ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

async function PaymentMethodsTab({ donorId, churchId }: { donorId: string; churchId: string }) {
  const { instruments } = await loadDonorInstrumentIds(donorId, churchId);
  const subCountByInstrument = new Map<string, number>();
  const subs = await prisma.finixSubscription.findMany({ where: { churchId, donorId, finixPaymentInstrumentId: { not: null } }, select: { finixPaymentInstrumentId: true } });
  for (const s of subs) {
    if (!s.finixPaymentInstrumentId) continue;
    subCountByInstrument.set(s.finixPaymentInstrumentId, (subCountByInstrument.get(s.finixPaymentInstrumentId) || 0) + 1);
  }

  return (
    <Card title="Payment Methods">
      {instruments.length === 0 ? (
        <p className="text-sm text-slate-500">Payment methods associated with this donor will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Brand</th>
                <th className="py-2 pr-4">Masked Number</th>
                <th className="py-2 pr-4">Expiration</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Subscriptions Using It</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4 text-slate-600">{i.cardLast4 ? "Card" : i.bankLast4 ? "Bank Account" : "Unknown"}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.cardBrand || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">•••• {i.cardLast4 || i.bankLast4 || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.cardExpirationMonth ? `${i.cardExpirationMonth}/${i.cardExpirationYear}` : "—"}</td>
                  <td className="py-2 pr-4"><StateBadge state={i.enabled === false ? "DISABLED" : i.state} /></td>
                  <td className="py-2 text-slate-600">{subCountByInstrument.get(i.finixPaymentInstrumentId) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function GivingLinksTab({ donorId, churchId, scopedUserId }: { donorId: string; churchId: string; scopedUserId?: string }) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const rows = await loadDonorGivingLinksTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Giving Links">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Giving Links this donor used will appear here.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ link, successful, totalCents, recurringCreated }) => (
            <div key={link.id} className="flex items-center justify-between text-sm">
              <Link href={`/merchant/giving-links/${link.id}`} className="text-blue-600 hover:underline font-semibold">{link.publicTitle}</Link>
              <span className="text-slate-600">{successful} donations · {formatCents(totalCents)} · {recurringCreated} recurring created</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

async function RefundsTab({ donorId, churchId, scopedUserId }: { donorId: string; churchId: string; scopedUserId?: string }) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const refunds = await loadDonorRefundsTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Refunds">
      {refunds.length === 0 ? (
        <p className="text-sm text-slate-500">Refunds associated with this donor will appear here.</p>
      ) : (
        <div className="space-y-2">
          {refunds.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{formatDateTime(r.createdAtFinix)}</span>
              <StateBadge state={r.state} />
              <span className="font-semibold text-slate-900">{formatCents(r.amountCents ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

async function BankReturnsTab({ donorId, churchId, scopedUserId }: { donorId: string; churchId: string; scopedUserId?: string }) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const returns = await loadDonorBankReturnsTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Bank Returns">
      {returns.length === 0 ? (
        <p className="text-sm text-slate-500">ACH return activity associated with this donor will appear here.</p>
      ) : (
        <div className="space-y-2">
          {returns.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{formatDateTime(r.createdAtFinix)}</span>
              <span className="text-slate-500">{r.reasonDescription || r.reasonCode || "—"}</span>
              <span className="font-semibold text-slate-900">{formatCents(r.amountCents ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

async function DisputesTab({ donorId, churchId, scopedUserId }: { donorId: string; churchId: string; scopedUserId?: string }) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const disputes = await loadDonorDisputesTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Disputes">
      {disputes.length === 0 ? (
        <p className="text-sm text-slate-500">Disputes related to this donor's payments will appear here.</p>
      ) : (
        <div className="space-y-2">
          {disputes.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{formatDateTime(d.createdAtFinix)}</span>
              <StateBadge state={d.state} />
              <span className="font-semibold text-slate-900">{formatCents(d.amountCents ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

async function ActivityTab({ donorId, churchId, donor, scopedUserId }: { donorId: string; churchId: string; donor: any; scopedUserId?: string }) {
  const { instrumentIds } = await loadDonorInstrumentIds(donorId, churchId);
  const events = await loadDonorActivityTab(donor, instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Donor activity will appear here as recurring donations and account events occur.</p>
      ) : (
        <div className="space-y-4">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-1">
                {e.href ? (
                  <Link href={e.href} className="text-sm font-semibold text-blue-600 hover:underline">{e.label}</Link>
                ) : (
                  <p className="text-sm font-semibold text-slate-800">{e.label}</p>
                )}
                {e.sublabel && <p className="text-xs text-slate-500">{e.sublabel}</p>}
                <p className="text-xs text-slate-400">
                  {formatDateTime(e.date)}
                  {e.amountCents != null && ` · ${formatCents(e.amountCents)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
