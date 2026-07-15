import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import { loadGivingLinkAttempts } from "@/lib/givingLinks/attempts";
import GivingLinkDetailHeader from "@/components/merchant/GivingLinkDetailHeader";
import GivingLinkOverviewTab from "@/components/merchant/GivingLinkOverviewTab";
import GivingLinkSharingHistoryTable from "@/components/merchant/GivingLinkSharingHistoryTable";
import DonationAttemptsTable from "@/components/merchant/DonationAttemptsTable";

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default async function GivingLinkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "attempts" || sp.tab === "sharing" ? sp.tab : "overview";

  const link = await prisma.givingLink.findFirst({ where: { id, churchId } });
  if (!link) notFound();

  const status = resolveGivingLinkStatus(link);
  const netCollectedCents = link.totalCollectedCents - link.refundedCents - link.returnedCents;

  return (
    <div>
      <Link href="/merchant/giving-links" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Giving Links
      </Link>

      <GivingLinkDetailHeader
        id={link.id}
        internalName={link.internalName}
        publicSlug={link.publicSlug}
        publicTitle={link.publicTitle}
        status={status}
        createdAt={link.createdAt}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <MetricCard label="Public Title" value={link.publicTitle} />
          <MetricCard label="Amount Type" value={link.amountType === "VARIABLE" ? "Variable" : "Fixed"} />
          <MetricCard label="Link Type" value={link.linkType === "ONE_TIME" ? "One-Time" : "Multi-Use"} />
          <MetricCard label="Expires" value={link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "No expiration"} />
          <MetricCard label="Total Attempts" value={String(link.totalAttempts)} />
          <MetricCard label="Successful Donations" value={String(link.successfulDonations)} />
          <MetricCard label="Total Collected" value={formatCents(link.totalCollectedCents)} />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-100 mb-6">
        {([
          { key: "overview", label: "Overview" },
          { key: "attempts", label: "Donation Attempts" },
          { key: "sharing", label: "Sharing History" },
        ] as const).map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? `/merchant/giving-links/${id}` : `/merchant/giving-links/${id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "overview" && <GivingLinkOverviewTab link={link} />}

      {tab === "attempts" && (
        <LinkAttemptsSection churchId={churchId} link={link} netCollectedCents={netCollectedCents} searchParams={sp} />
      )}

      {tab === "sharing" && <GivingLinkSharingHistoryTable givingLinkId={id} churchId={churchId} />}
    </div>
  );
}

async function LinkAttemptsSection({
  churchId,
  link,
  netCollectedCents,
  searchParams,
}: {
  churchId: string;
  link: NonNullable<Awaited<ReturnType<typeof prisma.givingLink.findFirst>>>;
  netCollectedCents: number;
  searchParams: Record<string, string | undefined>;
}) {
  const attempts = await loadGivingLinkAttempts(churchId, { givingLinkId: link.id, take: 500 });
  const failed = attempts.filter(({ transfer, payment }) => (transfer?.state || payment.status || "").toUpperCase() === "FAILED").length;
  const pending = attempts.filter(({ transfer, payment }) => (transfer?.state || payment.status || "").toUpperCase() === "PENDING").length;
  const validSubmitted = attempts.length;
  const conversionRate = validSubmitted > 0 ? ((link.successfulDonations / validSubmitted) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard label="Total Attempts" value={String(link.totalAttempts)} />
          <MetricCard label="Successful Donations" value={String(link.successfulDonations)} />
          <MetricCard label="Failed Attempts" value={String(failed)} />
          <MetricCard label="Pending Attempts" value={String(pending)} />
          <MetricCard label="Refunded Amount" value={formatCents(link.refundedCents)} />
          <MetricCard label="Returned ACH Amount" value={formatCents(link.returnedCents)} />
          <MetricCard label="Gross Collected" value={formatCents(link.totalCollectedCents)} />
          <MetricCard label="Net Collected" value={formatCents(netCollectedCents)} />
          <MetricCard label="Conversion Rate" value={`${conversionRate}%`} />
        </div>
      </div>

      <DonationAttemptsTable churchId={churchId} searchParams={searchParams} givingLinkId={link.id} />
    </div>
  );
}
