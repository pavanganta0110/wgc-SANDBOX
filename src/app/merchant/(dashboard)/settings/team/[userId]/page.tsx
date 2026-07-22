import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { formatCents } from "@/lib/format";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { canOpenTeamMemberDetail, canExportTeamMemberData } from "@/lib/settings/teamMemberAccess";
import {
  loadTeamMemberSummary,
  loadTeamMemberGivingLinks,
  loadTeamMemberTransactions,
  loadTeamMemberRecurring,
} from "@/lib/settings/teamMemberDetail";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import StateBadge from "@/components/merchant/StateBadge";
import ViewMemberDashboardButton from "@/components/merchant/ViewMemberDashboardButton";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", fundraiser: "Fundraiser", viewer: "Viewer", church_admin: "Admin" };
const TABS = ["overview", "giving-links", "transactions", "recurring"] as const;
type Tab = (typeof TABS)[number];

function KpiCard({ label, value, href, sublabel }: { label: string; value: string; href?: string; sublabel?: string }) {
  const body = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 h-full hover:border-slate-300 transition-colors">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function tabHref(userId: string, tab: Tab) {
  return `/merchant/settings/team/${userId}${tab === "overview" ? "" : `?tab=${tab}`}`;
}

export default async function TeamMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }

  const { userId } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const summary = await loadTeamMemberSummary(auth.churchId, userId);
  if (!summary) redirect("/merchant/settings/team");

  // Team-access: cross-church targets are rejected inside
  // canOpenTeamMemberDetail (target.churchId is implicitly auth.churchId
  // here since loadTeamMemberSummary already scoped the lookup by
  // churchId — a cross-church userId simply returns null above, which is
  // the 404-shaped redirect just taken). This second check additionally
  // enforces the self-or-team-management-permission rule.
  if (!canOpenTeamMemberDetail(auth, { id: summary.userId, churchId: auth.churchId })) {
    redirect("/merchant/settings/team");
  }
  const canExport = canExportTeamMemberData(auth, { id: summary.userId, churchId: auth.churchId });
  const isSelf = summary.userId === auth.userId;
  const status = summary.disabled ? "DISABLED" : "ACTIVE";

  return (
    <div>
      <Link href="/merchant/settings/team" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Team
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{summary.email}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-slate-500">{ROLE_LABELS[summary.role] || summary.role}</span>
            <StateBadge state={status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSelf && <ViewMemberDashboardButton userId={summary.userId} />}
          {canExport && (
            <>
              <a
                href={`/api/merchant/settings/team/${summary.userId}/export`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </a>
              <a
                href={`/api/merchant/settings/team/${summary.userId}/export?format=pdf`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </a>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Gross Raised" value={formatCents(summary.grossRaisedCents)} href={tabHref(summary.userId, "transactions")} />
        <KpiCard label="Net Raised" value={formatCents(summary.netRaisedCents)} href={tabHref(summary.userId, "transactions")} />
        <KpiCard label="Total Transactions" value={String(summary.transactionCount)} href={tabHref(summary.userId, "transactions")} />
        <KpiCard label="Active Giving Links" value={String(summary.activeGivingLinkCount)} href={tabHref(summary.userId, "giving-links")} />
        <KpiCard label="Recurring Donors" value={String(summary.recurringDonorCount)} href={tabHref(summary.userId, "recurring")} />
        <KpiCard label="Refund Amount" value={formatCents(summary.refundAmountCents)} href={tabHref(summary.userId, "transactions")} />
        <KpiCard label="Average Donation" value={formatCents(summary.averageDonationCents)} />
        <KpiCard label="Last Donation" value={summary.lastDonationAt ? formatDateCDT(summary.lastDonationAt) : "Never"} />
      </div>

      <div className="flex items-center gap-1 border-b border-slate-100 mb-6">
        {TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(summary.userId, t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "overview" ? "Overview" : t === "giving-links" ? "Giving Links" : t === "transactions" ? "Transactions" : "Recurring Donations"}
          </Link>
        ))}
      </div>

      {tab === "overview" && <OverviewTab churchId={auth.churchId} userId={summary.userId} />}
      {tab === "giving-links" && <GivingLinksTab churchId={auth.churchId} userId={summary.userId} />}
      {tab === "transactions" && <TransactionsTab churchId={auth.churchId} userId={summary.userId} />}
      {tab === "recurring" && <RecurringTab churchId={auth.churchId} userId={summary.userId} />}
    </div>
  );
}

async function OverviewTab({ churchId, userId }: { churchId: string; userId: string }) {
  const [links, transactions] = await Promise.all([
    loadTeamMemberGivingLinks(churchId, userId),
    loadTeamMemberTransactions(churchId, userId),
  ]);
  const recentLinks = links.slice(0, 5);
  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Transactions</h3>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-400">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((t) => (
              <div key={t.paymentId} className="flex items-center justify-between text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="font-semibold text-slate-800">{t.donorName}</p>
                  <p className="text-xs text-slate-400">{formatDateCDT(t.createdAt)}</p>
                </div>
                <span className="font-semibold text-slate-900">{formatCents(t.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Giving Links</h3>
        {recentLinks.length === 0 ? (
          <p className="text-sm text-slate-400">No giving links yet.</p>
        ) : (
          <div className="space-y-2">
            {recentLinks.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="font-semibold text-slate-800">{l.internalName || l.publicTitle}</p>
                  <p className="text-xs text-slate-400">{l.successfulDonations} donation{l.successfulDonations === 1 ? "" : "s"}</p>
                </div>
                <span className="font-semibold text-slate-900">{formatCents(l.totalCollectedCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function GivingLinksTab({ churchId, userId }: { churchId: string; userId: string }) {
  const links = await loadTeamMemberGivingLinks(churchId, userId);
  if (links.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No giving links owned by this member.</p>;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
            <th className="px-6 py-3">Link Name</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3 text-right">Transactions</th>
            <th className="px-6 py-3 text-right">Gross Raised</th>
            <th className="px-6 py-3">Last Donation</th>
            <th className="px-6 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {links.map((l) => (
            <tr key={l.id} className="border-t border-slate-50">
              <td className="px-6 py-3 font-semibold text-slate-800">{l.internalName || l.publicTitle}</td>
              <td className="px-6 py-3"><StateBadge state={l.status} /></td>
              <td className="px-6 py-3 text-right text-slate-600">{l.successfulDonations}</td>
              <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(l.totalCollectedCents)}</td>
              <td className="px-6 py-3 text-slate-600">{l.lastUsedAt ? formatDateCDT(l.lastUsedAt) : "—"}</td>
              <td className="px-6 py-3">
                <Link href={`/merchant/giving-links?id=${l.id}`} className="text-blue-600 hover:underline text-xs font-semibold">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function TransactionsTab({ churchId, userId }: { churchId: string; userId: string }) {
  const transactions = await loadTeamMemberTransactions(churchId, userId);
  if (transactions.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No transactions attributed to this member.</p>;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[1200px]">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
            <th className="px-6 py-3">Date</th>
            <th className="px-6 py-3">Donor</th>
            <th className="px-6 py-3">Giving Link</th>
            <th className="px-6 py-3">Fund</th>
            <th className="px-6 py-3">Payment Method</th>
            <th className="px-6 py-3 text-right">Gross</th>
            <th className="px-6 py-3 text-right">Fee</th>
            <th className="px-6 py-3 text-right">Refunded</th>
            <th className="px-6 py-3 text-right">Net</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Settlement</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.paymentId} className="border-t border-slate-50">
              <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateCDT(t.createdAt)}</td>
              <td className="px-6 py-3 text-slate-700">{t.donorName}</td>
              <td className="px-6 py-3 text-slate-600">{t.givingLinkName || "—"}</td>
              <td className="px-6 py-3 text-slate-600">{t.fundName || "Unspecified"}</td>
              <td className="px-6 py-3 text-slate-600">{t.paymentMethodType}</td>
              <td className="px-6 py-3 text-right text-slate-700">{formatCents(t.amountCents)}</td>
              <td className="px-6 py-3 text-right text-slate-600">{t.feeCents > 0 ? formatCents(t.feeCents) : "—"}</td>
              <td className="px-6 py-3 text-right text-slate-600">{t.refundedCents > 0 ? formatCents(t.refundedCents) : "—"}</td>
              <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(t.netCents)}</td>
              <td className="px-6 py-3"><StateBadge state={t.status} /></td>
              <td className="px-6 py-3">
                {t.settlementId ? (
                  <Link href={`/merchant/settlements?id=${t.settlementId}`} className="text-blue-600 hover:underline text-xs font-semibold">
                    {t.settlementState === "SETTLED" || t.settledAt ? "Settled" : t.settlementState || "View"}
                  </Link>
                ) : (
                  <span className="text-slate-400 text-xs">Not yet settled</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function RecurringTab({ churchId, userId }: { churchId: string; userId: string }) {
  const subs = await loadTeamMemberRecurring(churchId, userId);
  if (subs.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No recurring donations attributed to this member.</p>;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
            <th className="px-6 py-3">Donor</th>
            <th className="px-6 py-3 text-right">Amount</th>
            <th className="px-6 py-3">Frequency</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Giving Link</th>
            <th className="px-6 py-3">Next Charge</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-t border-slate-50">
              <td className="px-6 py-3 font-semibold text-slate-800">{s.donorName}</td>
              <td className="px-6 py-3 text-right text-slate-700">{formatCents(s.amountCents)}</td>
              <td className="px-6 py-3 text-slate-600">{frequencyLabel(s.billingInterval)}</td>
              <td className="px-6 py-3"><StateBadge state={s.displayStatus} /></td>
              <td className="px-6 py-3 text-slate-600">{s.givingLinkName || "—"}</td>
              <td className="px-6 py-3 text-slate-600">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
