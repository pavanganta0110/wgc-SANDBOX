import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, TrendingUp, TrendingDown, Repeat, Clock, DollarSign, ArrowRight } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { loadReportingKpis } from "@/lib/reporting/dashboard";
import { loadGivingByFund, loadOrgPaymentMethodMix, bucketDonorsByLifetimeGiving } from "@/lib/reporting/orgCharts";
import { loadDonorAggregatesBatch } from "@/lib/donors/donorAggregates";
import { loadDonationTrend } from "@/lib/donors/donorAnalytics";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import DonationTrendChart from "@/components/merchant/DonationTrendChart";
import BarChart from "@/components/merchant/BarChart";

export default async function ReportingDashboardPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);

  const [kpis, trend, givingByFund, paymentMethodMix] = await Promise.all([
    loadReportingKpis(auth),
    loadDonationTrend(auth.churchId, undefined, "monthly", scopedDonorIds ?? undefined, "all"),
    loadGivingByFund(auth.churchId, undefined, scopedDonorIds ?? undefined),
    loadOrgPaymentMethodMix(auth.churchId, undefined, scopedDonorIds ?? undefined),
  ]);

  // Donor distribution needs a per-donor lifetime figure — capped at the
  // same MAX_AGGREGATED_DONORS bound the reporting engine itself uses, so
  // this dashboard chart never triggers an unbounded per-donor scan.
  const distributionDonorWhere = { churchId: auth.churchId, archivedAt: null, ...(scopedDonorIds ? { id: { in: scopedDonorIds } } : {}) };
  const distributionDonors = await prisma.donor.findMany({ where: distributionDonorWhere, select: { id: true }, take: 5000 });
  const lifetimeAgg = await loadDonorAggregatesBatch(
    distributionDonors.map((d) => d.id),
    auth.churchId,
  );
  const donorDistribution = bucketDonorsByLifetimeGiving([...lifetimeAgg.values()].map((a) => a.netDonatedCents));

  const cards: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: "Total Donors", value: kpis.totalDonors.toLocaleString(), icon: <Users className="w-4 h-4" /> },
    { label: "New Donors", value: kpis.newDonors.toLocaleString(), icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Returning Donors", value: kpis.returningDonors.toLocaleString(), icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Recurring Donors", value: kpis.recurringDonors.toLocaleString(), icon: <Repeat className="w-4 h-4" /> },
    { label: "Lapsed Donors", value: kpis.lapsedDonors.toLocaleString(), icon: <TrendingDown className="w-4 h-4" /> },
    { label: "Average Gift (YTD)", value: formatCents(kpis.averageGiftCents), icon: <DollarSign className="w-4 h-4" /> },
    { label: "YTD Giving", value: formatCents(kpis.ytdGivingCents), icon: <DollarSign className="w-4 h-4" /> },
    { label: "Previous Year Giving", value: formatCents(kpis.previousYearGivingCents), icon: <Clock className="w-4 h-4" /> },
    { label: "Lifetime Giving", value: formatCents(kpis.lifetimeGivingCents), icon: <DollarSign className="w-4 h-4" /> },
    { label: "Donor Retention Rate", value: `${kpis.donorRetentionRatePercent.toFixed(1)}%`, icon: <TrendingUp className="w-4 h-4" /> },
  ];

  const reportLinks = [
    { href: "/merchant/reporting/donors", title: "Donor Report", description: "Filter, customize columns, and export donor giving data." },
    { href: "/merchant/reporting/annual", title: "Annual Giving Report", description: "Total giving by calendar year, matching Annual Statements." },
    { href: "/merchant/reporting/recurring", title: "Recurring Giving", description: "Active, paused, and canceled recurring donors." },
    { href: "/merchant/reporting/lapsed", title: "Lapsed Donors", description: "Donors who haven't given recently — useful for follow-up." },
    { href: "/merchant/reporting/saved", title: "Saved Reports", description: "Your saved report configurations." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Reporting</h3>
        <p className="text-xs text-slate-500 mt-0.5">Donor analytics, giving reports, and exports — scoped to your organization.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">{c.icon}<span className="text-xs font-semibold">{c.label}</span></div>
            <div className="text-lg font-bold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h4 className="text-sm font-bold text-slate-900 mb-4">Giving by Month</h4>
        <DonationTrendChart data={trend} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h4 className="text-sm font-bold text-slate-900 mb-4">New vs Returning Donors</h4>
          <BarChart
            data={[
              { label: "New", value: kpis.newDonors },
              { label: "Returning", value: kpis.returningDonors },
              { label: "Recurring", value: kpis.recurringDonors },
              { label: "Lapsed", value: kpis.lapsedDonors },
            ]}
            formatValue={(n) => n.toLocaleString()}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h4 className="text-sm font-bold text-slate-900 mb-4">Payment Method Mix</h4>
          <BarChart
            data={paymentMethodMix.map((m) => ({ label: m.method, value: m.amountCents }))}
            formatValue={(n) => formatCents(n)}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h4 className="text-sm font-bold text-slate-900 mb-4">Donor Distribution (Lifetime Giving)</h4>
          <BarChart
            data={donorDistribution.map((d) => ({ label: d.label, value: d.donorCount }))}
            formatValue={(n) => n.toLocaleString()}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h4 className="text-sm font-bold text-slate-900 mb-4">Giving by Fund</h4>
        <BarChart
          data={givingByFund.slice(0, 10).map((f) => ({ label: f.fundName, value: f.amountCents }))}
          formatValue={(n) => formatCents(n)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reportLinks.map((r) => (
          <Link key={r.href} href={r.href} className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-slate-300 transition">
            <div>
              <div className="text-sm font-bold text-slate-900">{r.title}</div>
              <p className="text-xs text-slate-500 mt-0.5 max-w-md">{r.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
