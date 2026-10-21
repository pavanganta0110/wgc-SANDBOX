import Link from "next/link";
import {
  Building2,
  CircleDollarSign,
  FileText,
  Inbox,
  LifeBuoy,
  MessageSquareReply,
  Receipt,
  Store,
  UserPlus,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { loadPlatformMetrics, parseAdminRange, resolveAdminPeriod } from "@/lib/admin/platformMetrics";
import { loadAdminOpsSummary } from "@/lib/admin/opsSummary";
import { loadResidualLedger } from "@/lib/admin/residuals";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { prisma } from "@/lib/prisma";
import { computeDelta } from "@/lib/reporting/reportingPeriod";
import KpiTile from "@/components/merchant/reporting/overview/KpiTile";
import DeltaPill from "@/components/merchant/reporting/overview/DeltaPill";
import Sparkline from "@/components/merchant/reporting/overview/Sparkline";
import Card from "@/components/merchant/reporting/overview/Card";
import { SERIES } from "@/components/merchant/reporting/overview/tokens";
import { formatCents } from "@/components/merchant/reporting/overview/format";
import RangeSelect from "@/components/admin/dashboard/RangeSelect";
import MethodBreakdown from "@/components/admin/dashboard/MethodBreakdown";
import MonthlyVolume from "@/components/admin/dashboard/MonthlyVolume";
import TopMerchants from "@/components/admin/dashboard/TopMerchants";
import ResidualPayouts from "@/components/admin/dashboard/ResidualPayouts";

function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

function RecentList({
  title,
  href,
  empty,
  items,
}: {
  title: string;
  href: string;
  empty: string;
  items: { id: string; href: string; primary: React.ReactNode; secondary?: string; date: Date }[];
}) {
  return (
    <Card
      title={title}
      action={
        <Link href={href} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          View all
        </Link>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-slate-900">{it.primary}</span>
                  {it.secondary && <span className="text-slate-500"> · {it.secondary}</span>}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-400">
                  {it.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function AdminDashboardHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  // The layout already gates this route; re-checked here because this page reads platform-wide financials.
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { range: rangeParam } = await searchParams;
  const period = resolveAdminPeriod(parseAdminRange(rangeParam), new Date());
  const adminUser = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const billingPerms = resolveWgcAdminBillingPermissions(session.role, adminUser?.permissionsJson);
  const [m, ops, residuals] = await Promise.all([
    loadPlatformMetrics(period),
    loadAdminOpsSummary(),
    billingPerms.canViewBilling ? loadResidualLedger() : Promise.resolve(null),
  ]);

  const icon = "h-4 w-4";
  const delta = m.previousProcessedCents === null ? null : computeDelta(m.processed.amountCents, m.previousProcessedCents);
  const netCents = m.processed.amountCents - m.refundsCents - m.returnsCents;
  const avgCents = m.processed.count > 0 ? Math.round(m.processed.amountCents / m.processed.count) : 0;
  const monthlyTotals = m.monthly.map((r) => r.cardCents + r.achCents + r.otherCents);
  const share = (cents: number) => (m.processed.amountCents > 0 ? `${Math.round((cents / m.processed.amountCents) * 100)}%` : "—");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Processing volume and merchants across all of WGC, plus the work waiting on the team.</p>
        </div>
        <RangeSelect range={period.range} />
      </header>

      <section aria-label="Processing">
        <GroupLabel hint={`${period.label} · successful charges, all merchants`}>Processing</GroupLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-12">
          <KpiTile
            size="lg"
            className="col-span-2 sm:col-span-3 lg:col-span-6"
            label="Total processed"
            value={formatCents(m.processed.amountCents)}
            icon={<CircleDollarSign className="h-5 w-5" />}
            tip="Gross volume of every successful card and ACH charge through Finix, across all merchants, before refunds and returns."
            delta={delta ? <DeltaPill delta={delta} vs={period.comparisonLabel} /> : undefined}
            hint={delta ? `vs ${period.comparisonLabel}` : "All time"}
            spark={<Sparkline values={monthlyTotals} color={SERIES.indigo} height={44} />}
          />
          <KpiTile
            className="sm:col-span-1 lg:col-span-2"
            label="Card"
            value={formatCents(m.byMethod.CARD.amountCents)}
            icon={<Wallet className={icon} />}
            tip="Credit, debit and prepaid card charges (including Apple Pay and Google Pay)."
            hint={`${share(m.byMethod.CARD.amountCents)} · ${m.byMethod.CARD.count.toLocaleString("en-US")} payments`}
          />
          <KpiTile
            className="sm:col-span-1 lg:col-span-2"
            label="ACH"
            value={formatCents(m.byMethod.ACH.amountCents)}
            icon={<Building2 className={icon} />}
            tip="Bank-account (ACH) debits."
            hint={`${share(m.byMethod.ACH.amountCents)} · ${m.byMethod.ACH.count.toLocaleString("en-US")} payments`}
          />
          <KpiTile
            className="col-span-2 sm:col-span-1 lg:col-span-2"
            label="Net processed"
            value={formatCents(netCents)}
            icon={<Receipt className={icon} />}
            tip="Total processed minus successful refunds and ACH returns in the same period."
            hint={`${formatCents(m.refundsCents + m.returnsCents)} refunded/returned`}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Payments"
            value={m.processed.count.toLocaleString("en-US")}
            icon={<Zap className={icon} />}
            tip="Number of successful charges in this period."
            hint={period.label}
          />
          <KpiTile
            label="Average payment"
            value={formatCents(avgCents)}
            icon={<Receipt className={icon} />}
            tip="Total processed divided by the number of payments."
            hint="Per successful charge"
          />
          <KpiTile
            label="Refunds"
            value={formatCents(m.refundsCents)}
            icon={<XCircle className={icon} />}
            tip="Successful merchant-issued refunds in this period."
            hint="Merchant-issued"
          />
          <KpiTile
            label="ACH returns"
            value={formatCents(m.returnsCents)}
            icon={<XCircle className={icon} />}
            tip="Bank returns (NACHA) received in this period."
            hint="Returned by the bank"
          />
        </div>
      </section>

      {residuals && (
        <section aria-label="Finix residuals">
          <GroupLabel hint="WGC's fee revenue, paid by Finix monthly · all time">Finix residuals</GroupLabel>
          <ResidualPayouts ledger={residuals} canManage={billingPerms.canManageBilling} />
        </section>
      )}

      <section aria-label="Merchants">
        <GroupLabel hint="Live account counts">Merchants</GroupLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Active merchants"
            href="/admin/merchants"
            value={m.merchants.active.toLocaleString("en-US")}
            icon={<Store className={icon} />}
            tip="Organizations with a live Finix merchant account that hasn't been terminated."
            hint={`of ${m.merchants.total.toLocaleString("en-US")} organizations`}
          />
          <KpiTile
            label="Processing"
            href="/admin/merchants"
            value={m.merchants.processingInPeriod.toLocaleString("en-US")}
            icon={<Zap className={icon} />}
            tip="Merchants with at least one successful charge in the selected period."
            hint={period.label}
          />
          <KpiTile
            label="New organizations"
            href="/admin/merchant-applications"
            value={m.merchants.newInPeriod.toLocaleString("en-US")}
            icon={<UserPlus className={icon} />}
            tip="Organizations created on WGC in the selected period."
            hint={period.label}
          />
          <KpiTile
            label="Terminated"
            href="/admin/merchants"
            value={m.merchants.terminated.toLocaleString("en-US")}
            icon={<XCircle className={icon} />}
            tip="Merchant accounts Finix has reported as terminated."
            hint="All time"
          />
        </div>
      </section>

      <section aria-label="Trends" className="space-y-3">
        <GroupLabel>Trends</GroupLabel>
        <MonthlyVolume rows={m.monthly} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <MethodBreakdown
            periodLabel={period.label}
            methods={[
              { key: "CARD", label: "Card", hint: "credit, debit, prepaid", ...m.byMethod.CARD },
              { key: "ACH", label: "ACH (bank)", hint: "bank-account debits", ...m.byMethod.ACH },
              { key: "OTHER", label: "Unclassified", hint: "instrument not synced yet", ...m.byMethod.OTHER },
            ]}
            cardTypes={[
              { key: "CREDIT", label: "Credit cards", hint: "issued as credit", ...m.byCardType.CREDIT },
              { key: "DEBIT", label: "Debit cards", hint: "issued as debit", ...m.byCardType.DEBIT },
              { key: "PREPAID", label: "Prepaid cards", hint: "issued as prepaid", ...m.byCardType.PREPAID },
              { key: "UNKNOWN", label: "Unknown type", hint: "not reported by Finix", ...m.byCardType.UNKNOWN },
            ]}
          />
          <TopMerchants rows={m.topMerchants} totalCents={m.processed.amountCents} periodLabel={period.label} />
        </div>
      </section>

      <section aria-label="Operations" className="space-y-3">
        <GroupLabel hint="Right now">Operations</GroupLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="New inquiries"
            href="/admin/inquiries"
            value={String(ops.inquiries.new)}
            icon={<Inbox className={icon} />}
            tip="Contact-sales inquiries nobody has picked up yet."
            hint={`${ops.inquiries.total} total · ${ops.inquiries.contacted} contacted`}
          />
          <KpiTile
            label="Documents under review"
            href="/admin/documents"
            value={String(ops.documents.underReview)}
            icon={<FileText className={icon} />}
            tip="Current 501(c)(3) documents waiting on WGC review."
            hint={`${ops.documents.total} total · ${ops.documents.approved} approved`}
          />
          <KpiTile
            label="Open tickets"
            href="/admin/support/tickets"
            value={String(ops.tickets.openCount)}
            icon={<LifeBuoy className={icon} />}
            tip="Support tickets that aren't resolved or closed."
            hint="Support queue"
          />
          <KpiTile
            label="Unread merchant replies"
            href="/admin/support/tickets"
            value={String(ops.tickets.unreadMerchantReplyCount)}
            icon={<MessageSquareReply className={icon} />}
            tip="Tickets where the merchant replied and no admin has read it yet."
            hint="Waiting on us"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <RecentList
            title="Recent inquiries"
            href="/admin/inquiries"
            empty="No inquiries yet."
            items={ops.recentInquiries.map((i) => ({
              id: i.id,
              href: `/admin/inquiries/${i.id}`,
              primary: `${i.firstName} ${i.lastName}`,
              secondary: i.company ?? undefined,
              date: i.createdAt,
            }))}
          />
          <RecentList
            title="Recent documents"
            href="/admin/documents"
            empty="No documents yet."
            items={ops.recentDocuments.map((d) => ({
              id: d.id,
              href: `/admin/documents/${d.id}`,
              primary: d.onboardingApplication.organizationName,
              secondary: d.originalFilename,
              date: d.uploadedAt,
            }))}
          />
          <RecentList
            title="Recent support tickets"
            href="/admin/support/tickets"
            empty="No tickets yet."
            items={ops.recentTickets.map((t) => ({
              id: t.id,
              href: `/admin/support/tickets/${t.id}`,
              primary: t.subject,
              secondary: t.ticketNumber,
              date: t.updatedAt,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
