import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import {
  resolveTransactionExportRows,
  summarizeTransactionReport,
  renderTransactionCsv,
  type PaymentExportFilter,
  type ReportMetadata,
  type TransactionExportRow,
  type TransactionReportSummary,
} from "@/lib/exports/transactionExport";
import { TransactionReportPdf } from "@/lib/exports/pdf/TransactionReportPdf";

export type ReportScope = "ENTIRE_ORGANIZATION" | "MY_ACTIVITY" | "TEAM_MEMBER" | "GIVING_LINK" | "DONOR";

export const REPORT_TYPE_LABELS: Record<ReportScope, string> = {
  ENTIRE_ORGANIZATION: "Organization Transaction Report",
  MY_ACTIVITY: "Team Member Transaction Report",
  TEAM_MEMBER: "Team Member Transaction and Settlement Report",
  GIVING_LINK: "Giving Link Transaction and Settlement Report",
  DONOR: "Donor Transaction and Settlement Report",
};

export interface ReportOwnerIdentity {
  name: string;
  email: string;
  userId: string;
  role: string;
}

export interface BuildTransactionReportOptions {
  churchId: string;
  scope: ReportScope;
  /** The person/resource the report is about — "Entire Organization" for
   * org-wide scope, per spec section 21. Never the exporting admin unless
   * they're exporting their own activity. */
  owner: ReportOwnerIdentity;
  generatedBy: { name: string; email: string };
  filter: Omit<PaymentExportFilter, "churchId">;
  appliedFiltersDescription: string;
  /** Extra scope-specific identity shown in the PDF header (giving link
   * name/id, donor name) — CSV carries this via the row's own
   * givingLinkName/donorName columns instead. */
}

export interface TransactionReportData {
  metadata: ReportMetadata;
  rows: TransactionExportRow[];
  summary: TransactionReportSummary;
}

/**
 * The one shared report-data builder every transaction/team-member/
 * giving-link/donor report — CSV or PDF — must go through. Never build
 * report totals independently per format; both renderTransactionCsv and
 * renderTransactionPdfBuffer below consume exactly this same
 * rows/summary, so CSV and PDF can never disagree.
 */
export async function buildTransactionReportData(options: BuildTransactionReportOptions): Promise<TransactionReportData> {
  const metadata: ReportMetadata = {
    reportType: REPORT_TYPE_LABELS[options.scope],
    reportScope: options.scope,
    ownerName: options.owner.name,
    ownerEmail: options.owner.email,
    ownerUserId: options.owner.userId,
    ownerRole: options.owner.role,
    generatedByName: options.generatedBy.name,
    generatedByEmail: options.generatedBy.email,
    generatedAt: new Date(),
    periodStart: options.filter.createdAtRange?.gte ?? null,
    periodEnd: options.filter.createdAtRange?.lte ?? null,
    appliedFilters: options.appliedFiltersDescription,
  };

  const rows = await resolveTransactionExportRows({ churchId: options.churchId, ...options.filter }, metadata);
  const summary = summarizeTransactionReport(rows);

  return { metadata, rows, summary };
}

export function renderTransactionReportCsv(data: TransactionReportData): string {
  return renderTransactionCsv(data.rows);
}

export async function renderTransactionReportPdf(data: TransactionReportData): Promise<Buffer> {
  const buffer = await renderToBuffer(TransactionReportPdf({ rows: data.rows, summary: data.summary }));
  return buffer as unknown as Buffer;
}

/** Users have no stored display name (User.email is the only identity
 * string in this schema) — "Name" fields for staff fall back to email. */
export async function resolveUserIdentity(userId: string): Promise<{ name: string; email: string; role: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!user) return null;
  return { name: user.email, email: user.email, role: user.role };
}
