import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds, resolveScopedUserId } from "@/lib/auth/scopes";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { formatDateTimeCDT as formatDateTime, formatDateCDT } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { formatPersonName } from "@/lib/formatPersonName";
import { computeRefundStatus, resolveDisplayStatus } from "@/lib/finix/refundStatus";
import { loadDonorDetail } from "@/lib/donors/donorDetail";
import { loadDonationTrend } from "@/lib/donors/donorAnalytics";
import { loadDonorFundBreakdown, loadDonorPaymentMethodMix } from "@/lib/donors/donorBreakdowns";
import { DONOR_DISPLAY_STATUS_LABELS } from "@/lib/donors/donorStatus";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import {
  loadDonorInstrumentIds,
  loadDonorDonationsTab,
  loadDonorRecurringTab,
  loadDonorGivingLinksTab,
  loadDonorRefundsTab,
  loadDonorBankReturnsTab,
  loadDonorDisputesTab,
  loadDonorActivityTab,
} from "@/lib/donors/donorTabs";
import DonorNotesList from "@/components/merchant/DonorNotesList";
import DonorRowActions from "@/components/merchant/DonorRowActions";
import EditDonorButton from "@/components/merchant/EditDonorButton";
import DuplicateDonorsCard from "@/components/merchant/DuplicateDonorsCard";
import DonorStatementsPanel from "@/components/merchant/DonorStatementsPanel";
import SendGivingLinkButton from "@/components/merchant/SendGivingLinkButton";
import DonationTrendChart from "@/components/merchant/DonationTrendChart";
import Pagination from "@/components/merchant/Pagination";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "donations", label: "Donations" },
  { key: "recurring", label: "Recurring Donations" },
  { key: "payment-methods", label: "Payment Methods" },
  { key: "giving-links", label: "Giving Links" },
  { key: "refunds", label: "Refunds" },
  { key: "bank-returns", label: "Bank Returns" },
  { key: "disputes", label: "Disputes" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const DONATIONS_PAGE_SIZE = 25;

export default async function DonorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ donorId: string }>;
  searchParams: Promise<{ tab?: string; page?: string; edit?: string }>;
}) {
  const auth = await requireMerchantSession();
  const churchId = auth.churchId;
  const permissions = getDonorPermissions(auth.rawRole);
  const { donorId } = await params;
  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "overview") as TabKey;

  // Team-access Checkpoint 4A/4B: a user-scoped view denies detail access
  // entirely when the donor has no payment/subscription attributed to that
  // user (donorNotFound), AND — fixed in 4B — every history tab below is
  // now filtered to just that user's attributed activity via scopedUserId,
  // not the donor's full organization-wide history.
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  const donorNotFound = scopedDonorIds !== null && !scopedDonorIds.includes(donorId);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const detail = donorNotFound ? null : await loadDonorDetail(donorId, churchId, scopedUserId);

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/donors" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Donors
        </Link>
        <p className="text-sm text-slate-500">This donor could not be found.</p>
      </div>
    );
  }

  const { donor, instruments, aggregates, status, needsAttentionReasons, notes } = detail;
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  const tabLink = (key: TabKey) => `/merchant/donors/${donorId}?tab=${key}`;

  return (
    <div>
      <Link href="/merchant/donors" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Donors
      </Link>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
          <span>Donor · {formatDateTime(donor.createdAt)}</span>
          <CopyableIdBadge id={donor.id} />
        </div>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name)}
          </h1>
          <StateBadge state={status} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm mb-4">
          <div>
            <p className="text-xs text-slate-500">Total Donated</p>
            <p className="font-bold text-slate-900">{formatCents(aggregates.totalDonatedCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Net Donated</p>
            <p className="font-bold text-slate-900">{formatCents(aggregates.netDonatedCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Donation Count</p>
            <p className="font-bold text-slate-900">{aggregates.donationCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Average Donation</p>
            <p className="font-bold text-slate-900">{formatCents(aggregates.averageDonationCents)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Active Recurring</p>
            <p className="font-bold text-slate-900">{aggregates.activeSubscriptionCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Last Donation</p>
            <p className="font-bold text-slate-900">{aggregates.lastDonationAt ? formatDateCDT(aggregates.lastDonationAt) : "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {permissions.canEdit && (
            <EditDonorButton
              donorId={donor.id}
              initialValues={{
                name: donor.name || "",
                email: donor.email || "",
                phone: donor.phone || "",
                addressLine1: donor.addressLine1 || "",
                addressLine2: donor.addressLine2 || "",
                city: donor.city || "",
                state: donor.state || "",
                postalCode: donor.postalCode || "",
                country: donor.country || "",
                companyName: donor.companyName || "",
                anonymousPreference: donor.anonymousPreference,
              }}
              autoOpen={sp.edit === "1"}
            />
          )}
          {permissions.canSendStatements && donor.email && <SendGivingLinkButton donorEmail={donor.email} />}
          <a
            href={`/api/merchant/donors/export?donorId=${donor.id}`}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Donor
          </a>
          <DonorRowActions
            donorId={donor.id}
            isArchived={Boolean(donor.archivedAt)}
            canArchive={permissions.canArchive}
            canRestore={permissions.canRestore}
            canExport={false}
          />
        </div>
      </div>

      {needsAttentionReasons.length > 0 && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{needsAttentionReasons.join(" · ")}</p>
        </div>
      )}

      {/* Tabs */}
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

      {tab === "overview" && (
        <OverviewTab
          churchId={churchId}
          donor={donor}
          aggregates={aggregates}
          instruments={instruments}
          notes={notes}
          canAddNote={permissions.canAddNote}
          canMerge={permissions.canMerge}
          canGenerateStatements={permissions.canGenerateStatements}
          canSendStatements={permissions.canSendStatements}
        />
      )}
      {tab === "donations" && (
        <DonationsTab instrumentIds={instrumentIds} churchId={churchId} page={Math.max(1, parseInt(sp.page || "1", 10) || 1)} scopedUserId={scopedUserId} />
      )}
      {tab === "recurring" && <RecurringTab instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "payment-methods" && <PaymentMethodsTab instruments={instruments} instrumentIds={instrumentIds} churchId={churchId} />}
      {tab === "giving-links" && <GivingLinksTab instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "refunds" && <RefundsTab instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "bank-returns" && <BankReturnsTab instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "disputes" && <DisputesTab instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
      {tab === "notes" && (
        <Card title="Internal Notes">
          <DonorNotesList donorId={donor.id} initialNotes={notes} editable={permissions.canAddNote} />
        </Card>
      )}
      {tab === "activity" && <ActivityTab donor={donor} instrumentIds={instrumentIds} churchId={churchId} scopedUserId={scopedUserId} />}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

async function OverviewTab({ churchId, donor, aggregates, instruments, notes, canAddNote, canMerge, canGenerateStatements, canSendStatements }: any) {
  const trend = await loadDonationTrend(churchId, undefined, "monthly");
  const primaryInstrument = instruments[0] ?? null;
  const instrumentIds = instruments.map((i: any) => i.finixPaymentInstrumentId);
  const [fundBreakdown, methodMix] = await Promise.all([
    loadDonorFundBreakdown(donor.id, churchId),
    loadDonorPaymentMethodMix(instrumentIds, churchId),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <DuplicateDonorsCard donorId={donor.id} canMerge={canMerge} />
        <Card title="Giving Summary">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Row label="Total Donated" value={formatCents(aggregates.totalDonatedCents)} />
            <Row label="Net Donated" value={formatCents(aggregates.netDonatedCents)} />
            <Row label="Donation Count" value={String(aggregates.donationCount)} />
            <Row label="Average Donation" value={formatCents(aggregates.averageDonationCents)} />
            <Row label="Largest Donation" value={formatCents(aggregates.largestDonationCents)} />
            <Row label="First Donation" value={aggregates.firstDonationAt ? formatDateCDT(aggregates.firstDonationAt) : "—"} />
            <Row label="Last Donation" value={aggregates.lastDonationAt ? formatDateCDT(aggregates.lastDonationAt) : "—"} />
            <Row label="Refunded" value={formatCents(aggregates.refundedAmountCents)} />
            <Row label="Returned" value={formatCents(aggregates.returnedAmountCents)} />
            <Row label="Disputed Exposure" value={formatCents(aggregates.disputedAmountCents)} />
          </div>
        </Card>
        <Card title="Donation Trend">
          <DonationTrendChart data={trend} />
        </Card>
        {fundBreakdown.length > 0 && (
          <Card title="Fund/Campaign Breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-2 pr-4">Fund/Campaign</th>
                    <th className="py-2 pr-4 text-right">Donations</th>
                    <th className="py-2 pr-4 text-right">Gross</th>
                    <th className="py-2 pr-4 text-right">Refunded</th>
                    <th className="py-2 pr-4 text-right">Returned</th>
                    <th className="py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {fundBreakdown.map((f: any) => (
                    <tr key={f.fundId} className="border-t border-slate-50">
                      <td className="py-2 pr-4 font-semibold text-slate-800">{f.fundName}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{f.donationCount}</td>
                      <td className="py-2 pr-4 text-right text-slate-900 font-semibold">{formatCents(f.grossCents)}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{formatCents(f.refundedCents)}</td>
                      <td className="py-2 pr-4 text-right text-slate-600">{formatCents(f.returnedCents)}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">{formatCents(f.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {methodMix.length > 0 && (
          <Card title="Payment Method Breakdown">
            <div className="space-y-2">
              {methodMix.map((m: any) => (
                <div key={m.method} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{titleCase(m.method)}</span>
                  <span className="font-semibold text-slate-900">
                    {formatCents(m.amountCents)} <span className="text-slate-400 font-normal">· {m.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        <Card title="Contact Information">
          <Row label="Email" value={donor.email || "—"} />
          <Row label="Phone" value={donor.phone || "—"} />
          {(donor.city || donor.state) && <Row label="Location" value={[donor.city, donor.state].filter(Boolean).join(", ")} />}
          {donor.companyName && <Row label="Organization" value={donor.companyName} />}
          <Row label="Donor Since" value={formatDateCDT(donor.createdAt)} />
        </Card>
        {primaryInstrument && (
          <Card title="Primary Payment Method">
            <Row
              label={primaryInstrument.cardBrand || (primaryInstrument.bankLast4 ? "Bank Account" : "Unknown")}
              value={`•••• ${primaryInstrument.cardLast4 || primaryInstrument.bankLast4 || "—"}`}
            />
          </Card>
        )}
        <Card title="Internal Notes">
          <DonorNotesList donorId={donor.id} initialNotes={notes} editable={canAddNote} limit={3} />
        </Card>
        <Card title="Year-End Donation Statements">
          <DonorStatementsPanel
            donorId={donor.id}
            donorName={donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name)}
            donorEmail={donor.email}
            canGenerate={canGenerateStatements}
            canSend={canSendStatements}
          />
        </Card>
      </div>
    </div>
  );
}

async function DonationsTab({ instrumentIds, churchId, page, scopedUserId }: { instrumentIds: string[]; churchId: string; page: number; scopedUserId?: string }) {
  const { rows, totalCount } = await loadDonorDonationsTab(instrumentIds, churchId, {}, page, DONATIONS_PAGE_SIZE, scopedUserId);
  const pageCount = Math.max(1, Math.ceil(totalCount / DONATIONS_PAGE_SIZE));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <h3 className="text-sm font-bold text-slate-900 mb-1">No donations</h3>
          <p className="text-sm text-slate-500">This donor&apos;s donation history will appear here.</p>
        </div>
      ) : (
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
              <th className="px-6 py-3">Payment ID</th>
              <th className="px-6 py-3">Created</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Net Amount</th>
              <th className="px-6 py-3">Payment Method</th>
              <th className="px-6 py-3">Last Four</th>
              <th className="px-6 py-3">Settlement</th>
              <th className="px-6 py-3">Fund</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ transfer, refunds, payment }) => {
              const refund = computeRefundStatus(transfer, refunds);
              return (
                <tr key={transfer.id} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Link href={`/merchant/transactions/payments?id=${transfer.finixTransferId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                      {transfer.finixTransferId}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(transfer.createdAtFinix)}</td>
                  <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(transfer.amountCents ?? 0)}</td>
                  <td className="px-6 py-3"><StateBadge state={resolveDisplayStatus(transfer.state, refund)} /></td>
                  <td className="px-6 py-3 text-right text-slate-600">{formatCents(refund.netAmountCents)}</td>
                  <td className="px-6 py-3 text-slate-600">{titleCase(transfer.type)}</td>
                  <td className="px-6 py-3 text-slate-600">—</td>
                  <td className="px-6 py-3">
                    {transfer.finixSettlementId ? (
                      <Link href={`/merchant/settlements?id=${transfer.finixSettlementId}`} className="text-blue-600 hover:underline text-xs">
                        {transfer.finixSettlementId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{payment?.fundName || "Unspecified"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={DONATIONS_PAGE_SIZE} />}
    </div>
  );
}

async function RecurringTab({ instrumentIds, churchId, scopedUserId }: { instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const subs = await loadDonorRecurringTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Recurring Donations">
      {subs.length === 0 ? (
        <p className="text-sm text-slate-500">Recurring donation schedules associated with this donor will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Subscription ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Frequency</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Next Billing</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4"><CopyableIdBadge id={s.finixSubscriptionId} /></td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(s.createdAtFinix)}</td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(s.amountCents ?? 0)}</td>
                  <td className="py-2 pr-4 text-slate-600">{titleCase(s.billingInterval)}</td>
                  <td className="py-2 pr-4"><StateBadge state={s.state} /></td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateCDT(s.nextBillingDate)}</td>
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

async function PaymentMethodsTab({ instruments }: { instruments: any[]; instrumentIds: string[]; churchId: string }) {
  return (
    <Card title="Payment Methods">
      {instruments.length === 0 ? (
        <p className="text-sm text-slate-500">Payment methods associated with this donor will appear here after a secure donation is completed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Brand</th>
                <th className="py-2 pr-4">Masked Number</th>
                <th className="py-2 pr-4">Account/Cardholder Name</th>
                <th className="py-2 pr-4">Expiration</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4 text-slate-600">{i.cardLast4 ? "Card" : i.bankLast4 ? "Bank Account" : titleCase(i.instrumentType)}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.cardBrand || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">•••• {i.cardLast4 || i.bankLast4 || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.accountHolderName || "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.cardExpirationMonth ? `${i.cardExpirationMonth}/${i.cardExpirationYear}` : "—"}</td>
                  <td className="py-2 pr-4"><StateBadge state={i.enabled === false ? "DISABLED" : i.state} /></td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{formatDateTime(i.createdAtFinix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function GivingLinksTab({ instrumentIds, churchId, scopedUserId }: { instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const rows = await loadDonorGivingLinksTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Giving Links">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Giving Links this donor used will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Giving Link</th>
                <th className="py-2 pr-4">First Used</th>
                <th className="py-2 pr-4">Last Used</th>
                <th className="py-2 pr-4 text-right">Attempts</th>
                <th className="py-2 pr-4 text-right">Successful Donations</th>
                <th className="py-2 pr-4 text-right">Total Donated</th>
                <th className="py-2 text-right">Recurring Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ link, attempts, successful, totalCents, firstUsed, lastUsed, recurringCreated }) => (
                <tr key={link.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/merchant/giving-links/${link.id}`} className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                      {link.publicTitle} <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{firstUsed ? formatDateCDT(firstUsed) : "—"}</td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{lastUsed ? formatDateCDT(lastUsed) : "—"}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{attempts}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{successful}</td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(totalCents)}</td>
                  <td className="py-2 text-right text-slate-600">{recurringCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function RefundsTab({ instrumentIds, churchId, scopedUserId }: { instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const refunds = await loadDonorRefundsTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Refunds">
      {refunds.length === 0 ? (
        <p className="text-sm text-slate-500">Refunds associated with this donor will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Refund ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Original Payment</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/merchant/transactions/refunds/${r.finixReversalId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                      {r.finixReversalId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(r.createdAtFinix)}</td>
                  <td className="py-2 pr-4">
                    {r.finixOriginalTransferId ? (
                      <Link href={`/merchant/transactions/payments?id=${r.finixOriginalTransferId}`} className="text-blue-600 hover:underline text-xs">
                        {r.finixOriginalTransferId}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(r.amountCents ?? 0)}</td>
                  <td className="py-2 pr-4"><StateBadge state={r.state} /></td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{formatDateTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function BankReturnsTab({ instrumentIds, churchId, scopedUserId }: { instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const returns = await loadDonorBankReturnsTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Bank Returns">
      {returns.length === 0 ? (
        <p className="text-sm text-slate-500">ACH return activity associated with this donor will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Return ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Original ACH Payment</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/merchant/transactions/bank-returns/${r.bankReturnId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                      {r.bankReturnId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(r.createdAtFinix)}</td>
                  <td className="py-2 pr-4">
                    {r.originalTransferId ? (
                      <Link href={`/merchant/transactions/payments?id=${r.originalTransferId}`} className="text-blue-600 hover:underline text-xs">
                        {r.originalTransferId}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(r.amountCents ?? 0)}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.reasonDescription || r.reasonCode || "—"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{formatDateTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function DisputesTab({ instrumentIds, churchId, scopedUserId }: { instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const disputes = await loadDonorDisputesTab(instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Disputes">
      {disputes.length === 0 ? (
        <p className="text-sm text-slate-500">Disputes related to this donor&apos;s payments will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Dispute ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Original Payment</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id} className="border-t border-slate-50">
                  <td className="py-2 pr-4">
                    <Link href={`/merchant/disputes/${d.finixDisputeId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                      {d.finixDisputeId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(d.createdAtFinix)}</td>
                  <td className="py-2 pr-4">
                    {d.finixTransferId ? (
                      <Link href={`/merchant/transactions/payments?id=${d.finixTransferId}`} className="text-blue-600 hover:underline text-xs">
                        {d.finixTransferId}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(d.amountCents ?? 0)}</td>
                  <td className="py-2 pr-4 text-slate-600">{titleCase(d.reason)}</td>
                  <td className="py-2 pr-4"><StateBadge state={d.state} /></td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{formatDateTime(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function ActivityTab({ donor, instrumentIds, churchId, scopedUserId }: { donor: any; instrumentIds: string[]; churchId: string; scopedUserId?: string }) {
  const events = await loadDonorActivityTab(donor, instrumentIds, churchId, scopedUserId);
  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">Donor activity will appear here as donations and account events occur.</p>
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
                  <Link href={e.href} className="text-sm font-semibold text-blue-600 hover:underline">
                    {e.label}
                  </Link>
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
