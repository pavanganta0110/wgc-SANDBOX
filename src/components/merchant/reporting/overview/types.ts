import type { Delta } from "@/lib/reporting/reportingPeriod";
import type { ReportKpis } from "@/lib/reporting/types";

export interface TrendRow {
  period: string;
  grossDonatedCents: number;
  netDonatedCents: number;
  donationCount: number;
  uniqueDonorCount: number;
}

export interface MixRow {
  key: "CARD" | "ACH" | "EXTERNAL";
  label: string;
  valueCents: number;
  count: number;
  sharePercent: number;
}

export interface BandRow {
  label: string;
  donorCount: number;
  sharePercent: number;
}

export interface FundRow {
  label: string;
  valueCents: number;
  sharePercent: number;
  isOther: boolean;
}

/** Plain, serializable data for the whole overview — built on the server, rendered by server and client components. */
export interface ReportingOverviewModel {
  year: number;
  isCurrentYear: boolean;
  yearOptions: number[];
  periodLabel: string;
  comparisonLabel: string;
  headline: string;
  kpis: ReportKpis;
  givingDelta: Delta;
  averageGiftDelta: Delta;
  trend: TrendRow[];
  methodMix: MixRow[];
  distribution: BandRow[];
  funds: FundRow[];
  savedReportsCount: number | null;
  canExport: boolean;
}
