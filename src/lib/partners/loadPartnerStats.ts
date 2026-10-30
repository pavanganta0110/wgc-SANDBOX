import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ATTRIBUTED_WHERE, JOINS, METHOD_SQL, SUCCESSFUL_CHARGE_WHERE, inRange, type AdminPeriod, type MethodKey } from "@/lib/admin/platformMetrics";
import { loadMerchantMoneyFlow } from "@/lib/admin/merchantMoneyFlow";
import { loadResidualLedger } from "@/lib/admin/residuals";

/**
 * What one partner's organizations processed and what it means for WGC, for the admin's
 * partner page. It follows the main admin dashboard's own rules so the numbers agree:
 *
 *  - processed / card / ACH / payments: successful Finix charges (SUCCESSFUL_CHARGE_WHERE),
 *    split by method with the same joins as Platform metrics;
 *  - refunds and ACH returns: succeeded Finix refunds, and bank returns;
 *  - fees, deposits, awaiting deposit: loadMerchantMoneyFlow's rows for these organizations;
 *  - WGC charged: WGC's own record of the fee charged on each payment (rate snapshot on the
 *    Payment), the same figure the residuals ledger uses as its cross-check.
 *
 * Finix's real cost and WGC's residual exist only as monthly platform-wide statements
 * (imported from Finix), not per merchant. The partner's share of each statement is therefore
 * an ESTIMATE: the partner's share of the fees WGC charged that month times the statement.
 * It is labelled as an estimate everywhere it is shown. Window is [from, to).
 */

export interface MerchantRow {
  churchId: string;
  name: string;
  reference: string | null;
  status: string;
  onboardingStatus: string | null;
  approvedAt: string | null;
  processedCents: number;
  paymentCount: number;
  /** Succeeded refunds plus ACH returns (the dashboard's "refunded"). */
  refundedCents: number;
  /** Platform fees billed to the organization (WGC's fee, as Finix records it). The dashboard's "fees". */
  finixFeesCents: number;
  /** The fee WGC charged on its payments (WGC's own record). */
  wgcChargedCents: number;
  depositedCents: number;
  awaitingDepositCents: number;
}

export interface ResidualEstimateMonth {
  month: string;
  label: string;
  partnerChargedCents: number;
  platformChargedCents: number;
  /** The partner's share of that month's platform fees, 0 to 100. */
  sharePercent: number;
  /** Null until Finix's statement for the month has been imported and approved. */
  estimatedFinixCostsCents: number | null;
  estimatedResidualCents: number | null;
}

export interface PartnerStats {
  partner: { id: string; name: string; pricePerMerchantCents: number | null };
  from: string;
  to: string;
  merchants: { linked: number; processing: number; active: number };
  processed: { amountCents: number; count: number };
  byMethod: Record<MethodKey, { amountCents: number; count: number }>;
  refundsCents: number;
  achReturnsCents: number;
  netProcessedCents: number;
  averagePaymentCents: number;
  moneyFlow: { finixFeesCents: number; donorCoveredFeesCents: number; depositedCents: number; pulledBackCents: number; awaitingDepositCents: number };
  wgc: {
    /** WGC's own record of the fee it charged on these payments. */
    chargedCents: number;
    /** What the partner paid WGC (per approved merchant per month) for the months in the window. */
    partnerBillingInvoicedCents: number;
    partnerBillingCollectedCents: number;
    /** Estimates from Finix's monthly platform statements. */
    estimatedFinixCostsCents: number;
    estimatedResidualCents: number;
    monthsAwaitingStatement: number;
    months: ResidualEstimateMonth[];
    estimatedRevenueCents: number;
  };
  byMerchant: MerchantRow[];
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const monthKey = (d: Date) => monthStart(d).toISOString();
const invoicePeriod = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function loadPartnerStats(partnerId: string, from: Date, to: Date): Promise<PartnerStats | null> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, pricePerMerchantCents: true } });
  if (!partner) return null;

  const churches = await prisma.church.findMany({
    where: { partnerId },
    select: { id: true, name: true, partnerReference: true, status: true, finixMerchantId: true, onboardingApplicationId: true },
    orderBy: { name: "asc" },
  });
  const ids = churches.map((c) => c.id);
  const period = { range: "all", label: "Custom", from, to, previous: null, comparisonLabel: "" } as AdminPeriod;
  const created = Prisma.sql`ft."createdAtFinix"`;

  let byMethod: PartnerStats["byMethod"] = { CARD: { amountCents: 0, count: 0 }, ACH: { amountCents: 0, count: 0 }, OTHER: { amountCents: 0, count: 0 } };
  let refundsCents = 0;
  let achReturnsCents = 0;
  let processing = 0;
  let chargedByChurch = new Map<string, number>();
  let chargedByMonth = new Map<string, number>();
  let moneyRows: Awaited<ReturnType<typeof loadMerchantMoneyFlow>>["rows"] = [];
  let approvals: { churchId: string; approvedAt: Date }[] = [];
  let applications: { id: string; onboardingStatus: string | null }[] = [];

  if (ids.length > 0) {
    const inIds = Prisma.join(ids);
    const applicationIds = churches.flatMap((c) => (c.onboardingApplicationId ? [c.onboardingApplicationId] : []));
    const firstMonth = monthStart(from);

    const [methodRows, processingRow, refundAgg, returnAgg, flow, chargedRows, monthlyRows, approvalRows, applicationRows] = await Promise.all([
      prisma.$queryRaw<{ method: MethodKey; amount: bigint | null; count: bigint }[]>(Prisma.sql`
        SELECT ${METHOD_SQL} AS method, SUM(ft."amountCents") AS amount, COUNT(*) AS count
        FROM "FinixTransfer" ft
        ${JOINS}
        WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ${ATTRIBUTED_WHERE} AND ft."churchId" IN (${inIds}) AND ${inRange(created, from, to)}
        GROUP BY 1`),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT ft."churchId") AS count
        FROM "FinixTransfer" ft
        WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ${ATTRIBUTED_WHERE} AND ft."churchId" IN (${inIds}) AND ${inRange(created, from, to)}`),
      prisma.finixRefundOrReversal.aggregate({
        where: { churchId: { in: ids }, state: { equals: "SUCCEEDED", mode: "insensitive" }, createdAtFinix: { gte: from, lt: to } },
        _sum: { amountCents: true },
      }),
      prisma.bankReturn.aggregate({ where: { churchId: { in: ids }, createdAtFinix: { gte: from, lt: to } }, _sum: { amountCents: true } }),
      loadMerchantMoneyFlow(period),
      prisma.$queryRaw<{ church_id: string; charged: number | null }[]>(Prisma.sql`
        SELECT p."churchId" AS church_id,
               SUM(ROUND(COALESCE(p."donationAmountCents", 0)::numeric * COALESCE(p."percentageBps", 0) / 10000) + COALESCE(p."fixedFeeCents", 0))::float8 AS charged
        FROM "Payment" p
        WHERE p."status" = 'SUCCEEDED' AND p."churchId" IN (${inIds}) AND p."createdAt" >= ${from} AND p."createdAt" < ${to}
        GROUP BY p."churchId"`),
      prisma.$queryRaw<{ month: Date; charged: number | null }[]>(Prisma.sql`
        SELECT date_trunc('month', p."createdAt") AS month,
               SUM(ROUND(COALESCE(p."donationAmountCents", 0)::numeric * COALESCE(p."percentageBps", 0) / 10000) + COALESCE(p."fixedFeeCents", 0))::float8 AS charged
        FROM "Payment" p
        WHERE p."status" = 'SUCCEEDED' AND p."churchId" IN (${inIds}) AND p."createdAt" >= ${firstMonth} AND p."createdAt" < ${to}
        GROUP BY 1`),
      prisma.partnerBillableApproval.findMany({ where: { partnerId }, select: { churchId: true, approvedAt: true } }),
      applicationIds.length > 0 ? prisma.onboardingApplication.findMany({ where: { id: { in: applicationIds } }, select: { id: true, onboardingStatus: true } }) : Promise.resolve([]),
    ]);

    for (const r of methodRows) byMethod[r.method] = { amountCents: num(r.amount), count: num(r.count) };
    processing = num(processingRow[0]?.count);
    refundsCents = refundAgg._sum.amountCents ?? 0;
    achReturnsCents = returnAgg._sum.amountCents ?? 0;
    const mine = new Set(ids);
    moneyRows = flow.rows.filter((r) => mine.has(r.churchId));
    chargedByChurch = new Map(chargedRows.map((r) => [r.church_id, Math.round(r.charged ?? 0)]));
    chargedByMonth = new Map(monthlyRows.map((r) => [monthKey(new Date(r.month)), Math.round(r.charged ?? 0)]));
    approvals = approvalRows;
    applications = applicationRows;
  }

  const processed = Object.values(byMethod).reduce((s, v) => ({ amountCents: s.amountCents + v.amountCents, count: s.count + v.count }), { amountCents: 0, count: 0 });

  // The partner's share of each month's Finix statement, estimated from the share of fees WGC charged.
  const residuals = ids.length > 0 ? await loadResidualLedger() : null;
  const platformMonths = new Map((residuals?.months ?? []).map((m) => [m.month, m]));
  const months: ResidualEstimateMonth[] = [];
  for (let m = monthStart(from); m < to; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const key = m.toISOString();
    const partnerCharged = chargedByMonth.get(key) ?? 0;
    const platform = platformMonths.get(key);
    const platformCharged = platform?.wgcChargedCents ?? 0;
    const statement = platform?.statement && platform.statement.state === "APPROVED" ? platform.statement : null;
    const share = platformCharged > 0 ? Math.min(1, partnerCharged / platformCharged) : 0;
    months.push({
      month: key,
      label: m.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      partnerChargedCents: partnerCharged,
      platformChargedCents: platformCharged,
      sharePercent: Math.round(share * 1000) / 10,
      estimatedFinixCostsCents: statement ? Math.round(share * statement.costsCents) : null,
      estimatedResidualCents: statement ? Math.round(share * statement.totalResidualCents) : null,
    });
  }
  const estimatedFinixCostsCents = months.reduce((a, m) => a + (m.estimatedFinixCostsCents ?? 0), 0);
  const estimatedResidualCents = months.reduce((a, m) => a + (m.estimatedResidualCents ?? 0), 0);
  const monthsAwaitingStatement = months.filter((m) => m.partnerChargedCents > 0 && m.estimatedResidualCents === null).length;

  const invoices = await prisma.partnerInvoice.findMany({
    where: { partnerId, period: { gte: invoicePeriod(from), lte: invoicePeriod(new Date(to.getTime() - 1)) } },
    select: { amountCents: true, status: true },
  });
  const partnerBillingInvoicedCents = invoices.filter((i) => i.status !== "WAIVED").reduce((a, i) => a + i.amountCents, 0);
  const partnerBillingCollectedCents = invoices.filter((i) => i.status === "SUCCEEDED").reduce((a, i) => a + i.amountCents, 0);

  const approvedAt = new Map(approvals.map((a) => [a.churchId, a.approvedAt.toISOString()]));
  const onboardingOf = new Map(applications.map((a) => [a.id, a.onboardingStatus]));
  const flowOf = new Map(moneyRows.map((r) => [r.churchId, r]));
  const byMerchant: MerchantRow[] = churches
    .map((c) => {
      const f = flowOf.get(c.id);
      return {
        churchId: c.id,
        name: c.name,
        reference: c.partnerReference,
        status: c.status,
        onboardingStatus: c.onboardingApplicationId ? (onboardingOf.get(c.onboardingApplicationId) ?? null) : null,
        approvedAt: approvedAt.get(c.id) ?? null,
        processedCents: f?.collectedCents ?? 0,
        paymentCount: f?.paymentCount ?? 0,
        refundedCents: f?.refundedCents ?? 0,
        finixFeesCents: f?.feesCents ?? 0,
        wgcChargedCents: chargedByChurch.get(c.id) ?? 0,
        depositedCents: f?.depositedCents ?? 0,
        awaitingDepositCents: f?.awaitingDepositCents ?? 0,
      };
    })
    .sort((a, b) => b.processedCents - a.processedCents || a.name.localeCompare(b.name));

  const sum = (pick: (r: MerchantRow) => number) => byMerchant.reduce((a, r) => a + pick(r), 0);
  const flowTotals = moneyRows.reduce(
    (t, r) => ({ donor: t.donor + r.donorCoveredFeesCents, pulled: t.pulled + r.pulledBackCents }),
    { donor: 0, pulled: 0 },
  );

  return {
    partner,
    from: from.toISOString(),
    to: to.toISOString(),
    merchants: { linked: churches.length, processing, active: churches.filter((c) => c.status === "ACTIVE" && c.finixMerchantId).length },
    processed,
    byMethod,
    refundsCents,
    achReturnsCents,
    netProcessedCents: processed.amountCents - refundsCents - achReturnsCents,
    averagePaymentCents: processed.count > 0 ? Math.round(processed.amountCents / processed.count) : 0,
    moneyFlow: {
      finixFeesCents: sum((r) => r.finixFeesCents),
      donorCoveredFeesCents: flowTotals.donor,
      depositedCents: sum((r) => r.depositedCents),
      pulledBackCents: flowTotals.pulled,
      awaitingDepositCents: sum((r) => r.awaitingDepositCents),
    },
    wgc: {
      chargedCents: sum((r) => r.wgcChargedCents),
      partnerBillingInvoicedCents,
      partnerBillingCollectedCents,
      estimatedFinixCostsCents,
      estimatedResidualCents,
      monthsAwaitingStatement,
      months,
      estimatedRevenueCents: estimatedResidualCents + partnerBillingCollectedCents,
    },
    byMerchant,
  };
}
