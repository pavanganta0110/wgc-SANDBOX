import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatDateCDT, formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import Pagination from "@/components/merchant/Pagination";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { loadPaymentsForSubscription } from "@/lib/subscriptions/subscriptionPayments";
import { loadSubscriptionActivity } from "@/lib/subscriptions/subscriptionActivity";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import SubscriptionActions from "@/components/merchant/SubscriptionActions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "schedule", label: "Schedule" },
  { key: "payment-method", label: "Payment Method" },
  { key: "giving-link", label: "Giving Link" },
  { key: "exceptions", label: "Exceptions" },
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

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const permissions = getSubscriptionPermissions(session?.role);
  const { subscriptionId } = await params;
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "overview") as TabKey;

  const [s] = await loadSubscriptionCandidates(churchId, { id: subscriptionId });
  if (!s) notFound();

  const tabLink = (key: TabKey) => `/merchant/subscriptions/${subscriptionId}?tab=${key}`;

  return (
    <div>
      <div className="mb-6">
        <Link href="/merchant/subscriptions" className="text-sm font-semibold text-blue-600 hover:underline">
          ← All Subscriptions
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Subscription</p>
            <CopyableIdBadge id={s.finixSubscriptionId} />
            <p className="text-sm text-slate-500 mt-1">Created {formatDateTime(s.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StateBadge state={s.displayStatus} />
            <SubscriptionActions
              subscriptionId={s.id}
              finixSubscriptionId={s.finixSubscriptionId}
              displayStatus={s.displayStatus}
              currentAmountCents={s.amountCents}
              currentBillingInterval={s.billingInterval}
              canCancel={permissions.canCancel}
              canUpdateAmount={permissions.canUpdateAmount}
              canUpdateFrequency={permissions.canUpdateFrequency}
              canSendPaymentUpdateLink={permissions.canSendPaymentUpdateLink}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Donor</p>
            <Link href={`/merchant/donors/${s.donorId}`} className="text-sm font-bold text-blue-600 hover:underline">{s.donorName}</Link>
          </div>
          <div>
            <p className="text-xs text-slate-500">Amount</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(s.amountCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Frequency</p>
            <p className="text-lg font-bold text-slate-900">{frequencyLabel(s.billingInterval)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Monthly Value</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(s.monthlyValueCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Start Date</p>
            <p className="text-sm font-semibold text-slate-700">{s.startDate ? formatDateCDT(s.startDate) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Next Billing Date</p>
            <p className="text-sm font-semibold text-slate-700">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Payment Method</p>
            <p className="text-sm font-semibold text-slate-700">{s.paymentMethod ? `${s.paymentMethod.brand || "Bank"} ••••${s.paymentMethod.last4 || ""}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Lifetime Collected</p>
            <p className="text-lg font-bold text-slate-900">{formatCents(s.lifetimeCollectedCents)}</p>
          </div>
        </div>
      </div>

      {s.requiresAttention && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{s.attentionReasons.join(" · ")}</p>
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

      {tab === "overview" && <OverviewTab s={s} />}
      {tab === "payments" && <PaymentsTab s={s} churchId={churchId} page={Math.max(1, parseInt(sp.page || "1", 10) || 1)} />}
      {tab === "schedule" && <ScheduleTab s={s} />}
      {tab === "payment-method" && <PaymentMethodTab s={s} />}
      {tab === "giving-link" && <GivingLinkTab s={s} />}
      {tab === "exceptions" && <ExceptionsTab s={s} churchId={churchId} />}
      {tab === "activity" && <ActivityTab s={s} churchId={churchId} />}
    </div>
  );
}

type Sub = Awaited<ReturnType<typeof loadSubscriptionCandidates>>[number];

function OverviewTab({ s }: { s: Sub }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card title="Subscription Details">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subscription ID</span><CopyableIdBadge id={s.finixSubscriptionId} /></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-800">{formatCents(s.amountCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Currency</span><span className="font-semibold text-slate-800">{s.currency}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-semibold text-slate-800">{frequencyLabel(s.billingInterval)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Monthly Normalized Value</span><span className="font-semibold text-slate-800">{formatCents(s.monthlyValueCents)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><StateBadge state={s.displayStatus} /></div>
            <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{s.startDate ? formatDateCDT(s.startDate) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Next Billing Date</span><span className="font-semibold text-slate-800">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">End Date</span><span className="font-semibold text-slate-800">{s.endDate ? formatDateCDT(s.endDate) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Failed Attempts</span><span className="font-semibold text-slate-800">{s.failedAttempts}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Last Successful Payment</span><span className="font-semibold text-slate-800">{s.lastPayment ? `${formatCents(s.lastPayment.amountCents)} · ${formatDateCDT(s.lastPayment.date)}` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Last Failed Payment</span><span className="font-semibold text-slate-800">{s.lastFailure ? formatDateCDT(s.lastFailure.date) : "—"}</span></div>
          </div>
        </Card>
        <Card title="Payment Performance">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-slate-500">Failed Attempts</p><p className="text-lg font-bold text-slate-900">{s.failedAttempts}</p></div>
            <div><p className="text-slate-500">Lifetime Collected</p><p className="text-lg font-bold text-slate-900">{formatCents(s.lifetimeCollectedCents)}</p></div>
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Donor">
          <Link href={`/merchant/donors/${s.donorId}`} className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
            {s.donorName} <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <p className="text-xs text-slate-500 mt-1">{s.donorEmail || "No email on file"}</p>
        </Card>
        <Card title="Payment Method">
          {s.paymentMethod ? (
            <p className="text-sm text-slate-700">{s.paymentMethod.brand || "Bank Account"} •••• {s.paymentMethod.last4 || "—"}</p>
          ) : (
            <p className="text-sm text-slate-500">No payment method on file.</p>
          )}
        </Card>
        <Card title="Related Resources">
          <div className="flex flex-col gap-1.5 text-sm">
            <Link href={`/merchant/recurring-donors/${s.donorId}`} className="text-blue-600 hover:underline">Recurring Donor</Link>
            {s.givingLinkId && <Link href={`/merchant/giving-links/${s.givingLinkId}`} className="text-blue-600 hover:underline">Giving Link</Link>}
          </div>
        </Card>
      </div>
    </div>
  );
}

async function PaymentsTab({ s, churchId, page }: { s: Sub; churchId: string; page: number }) {
  const { rows, totalCount } = await loadPaymentsForSubscription(s.finixSubscriptionId, churchId, page, PAYMENTS_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAYMENTS_PAGE_SIZE));

  return (
    <Card title="Payments">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Payments generated by this recurring donation schedule will appear here.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="py-2 pr-4">Payment ID</th>
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
  );
}

function ScheduleTab({ s }: { s: Sub }) {
  return (
    <Card title="Schedule">
      <div className="space-y-1.5 text-sm max-w-md">
        <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-semibold text-slate-800">{frequencyLabel(s.billingInterval)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Scheduled Amount</span><span className="font-semibold text-slate-800">{formatCents(s.amountCents)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{s.startDate ? formatDateCDT(s.startDate) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Next Billing Date</span><span className="font-semibold text-slate-800">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">End Date</span><span className="font-semibold text-slate-800">{s.endDate ? formatDateCDT(s.endDate) : "Ongoing"}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Timezone</span><span className="font-semibold text-slate-800">Central Time</span></div>
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Future billing dates beyond the confirmed next billing date are not shown — Finix confirms one upcoming date at a time, and WGC does not estimate or fabricate a longer schedule preview.
      </p>
    </Card>
  );
}

function PaymentMethodTab({ s }: { s: Sub }) {
  return (
    <Card title="Payment Method">
      {s.paymentMethod ? (
        <div className="space-y-1.5 text-sm max-w-md">
          <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-semibold text-slate-800">{s.paymentMethod.type === "BANK_ACCOUNT" ? "Bank Account" : "Card"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Brand</span><span className="font-semibold text-slate-800">{s.paymentMethod.brand || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Masked Number</span><span className="font-semibold text-slate-800">•••• {s.paymentMethod.last4 || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Account/Cardholder Name</span><span className="font-semibold text-slate-800">{s.paymentMethod.accountHolderName || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Expiration</span><span className="font-semibold text-slate-800">{s.paymentMethod.expirationMonth ? `${s.paymentMethod.expirationMonth}/${s.paymentMethod.expirationYear}` : "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">State</span><StateBadge state={s.paymentMethod.state} /></div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No payment method on file.</p>
      )}
    </Card>
  );
}

function GivingLinkTab({ s }: { s: Sub }) {
  return (
    <Card title="Giving Link">
      {s.givingLinkId ? (
        <Link href={`/merchant/giving-links/${s.givingLinkId}`} className="text-sm font-semibold text-blue-600 hover:underline">
          {s.givingLinkName || "View Giving Link"}
        </Link>
      ) : (
        <p className="text-sm text-slate-500">This subscription has no associated Giving Link.</p>
      )}
      {s.fundName && <p className="text-sm text-slate-600 mt-2">Fund/Campaign: {s.fundName}</p>}
    </Card>
  );
}

async function ExceptionsTab({ s, churchId }: { s: Sub; churchId: string }) {
  const { rows } = await loadPaymentsForSubscription(s.finixSubscriptionId, churchId, 1, 100);
  const exceptions = rows.filter((r) => r.transfer.state === "FAILED" || r.refunded || r.achReturned || r.disputed);

  return (
    <Card title="Exceptions">
      {exceptions.length === 0 ? (
        <p className="text-sm text-slate-500">No exceptions for this subscription.</p>
      ) : (
        <div className="space-y-2">
          {exceptions.map(({ transfer, refunded, achReturned, disputed }) => (
            <Link key={transfer.id} href={`/merchant/transactions/payments?id=${transfer.finixTransferId}`} className="flex items-center justify-between text-sm hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg">
              <div>
                <p className="text-slate-700">{transfer.state === "FAILED" ? "Failed Payment" : refunded ? "Refunded" : achReturned ? "ACH Return" : "Disputed"}</p>
                <p className="text-xs text-slate-400">{formatDateTime(transfer.createdAtFinix)}</p>
              </div>
              <p className="font-semibold text-slate-900">{formatCents(transfer.amountCents ?? 0)}</p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

async function ActivityTab({ s, churchId }: { s: Sub; churchId: string }) {
  const subscription = await prisma.finixSubscription.findFirst({ where: { id: s.id, churchId } });
  if (!subscription) return null;
  const events = await loadSubscriptionActivity(subscription, churchId);

  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Activity will appear here as this subscription generates events.</p>
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
