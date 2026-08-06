import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { buildCsvExport, csvResponse, sanitizeCsvFormulaValue, type CsvColumn } from "@/lib/csvExport";

type ExportType =
  | "promotional-leads"
  | "active-trials"
  | "paid-subscriptions"
  | "failed-payments"
  | "current-client-grants"
  | "invoice-usage"
  | "audit-history";

const VALID_TYPES: ExportType[] = [
  "promotional-leads",
  "active-trials",
  "paid-subscriptions",
  "failed-payments",
  "current-client-grants",
  "invoice-usage",
  "audit-history",
];

function safe(value: string): string {
  return sanitizeCsvFormulaValue(value);
}

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

/**
 * CSV exports for the admin billing dashboard. Every text-bearing column
 * runs through sanitizeCsvFormulaValue (mirrors the existing external
 * donations export pattern) since organization names, reasons, etc. can
 * contain admin- or user-supplied text that would otherwise be interpreted
 * as a spreadsheet formula when opened.
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canExportBillingData) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { type } = await params;
  if (!VALID_TYPES.includes(type as ExportType)) {
    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  }

  const csv = await buildExportCsv(type as ExportType);
  return csvResponse(csv, `${type}-${new Date().toISOString().slice(0, 10)}.csv`);
}

async function buildExportCsv(type: ExportType): Promise<string> {
  switch (type) {
    case "promotional-leads": {
      const leads = await prisma.promotionLead.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      const columns: CsvColumn<(typeof leads)[number]>[] = [
        { header: "ID", value: (r) => r.id },
        { header: "Organization Name", value: (r) => safe(r.organizationName || "") },
        { header: "Contact Name", value: (r) => safe(r.contactName || "") },
        { header: "Contact Email", value: (r) => safe(r.contactEmail || "") },
        { header: "Contact Phone", value: (r) => safe(r.contactPhone || "") },
        { header: "Campaign Source", value: (r) => safe(r.campaignSource || "") },
        { header: "Promotion ID", value: (r) => r.promotionId },
        { header: "Status", value: (r) => r.status },
        { header: "Organization ID", value: (r) => r.organizationId || "" },
        { header: "Created", value: (r) => iso(r.createdAt) },
      ];
      return buildCsvExport(leads, columns);
    }
    case "active-trials": {
      const subs = await prisma.wgcSubscription.findMany({ where: { status: "TRIALING" }, orderBy: { trialEndsAt: "asc" }, take: 5000 });
      const orgIds = [...new Set(subs.map((s) => s.organizationId))];
      const churches = await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
      const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));
      const columns: CsvColumn<(typeof subs)[number]>[] = [
        { header: "Organization", value: (r) => safe(nameByOrg.get(r.organizationId) || "") },
        { header: "Organization ID", value: (r) => r.organizationId },
        { header: "Plan Code", value: (r) => safe(r.planCode) },
        { header: "Amount", value: (r) => String(r.amountCents / 100) },
        { header: "Trial Starts", value: (r) => iso(r.trialStartsAt) },
        { header: "Trial Ends", value: (r) => iso(r.trialEndsAt) },
        { header: "First Charge", value: (r) => iso(r.firstChargeAt) },
      ];
      return buildCsvExport(subs, columns);
    }
    case "paid-subscriptions": {
      const subs = await prisma.wgcSubscription.findMany({ where: { status: "ACTIVE" }, orderBy: { nextChargeAt: "asc" }, take: 5000 });
      const orgIds = [...new Set(subs.map((s) => s.organizationId))];
      const churches = await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
      const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));
      const columns: CsvColumn<(typeof subs)[number]>[] = [
        { header: "Organization", value: (r) => safe(nameByOrg.get(r.organizationId) || "") },
        { header: "Organization ID", value: (r) => r.organizationId },
        { header: "Plan Code", value: (r) => safe(r.planCode) },
        { header: "Amount", value: (r) => String(r.amountCents / 100) },
        { header: "Next Charge", value: (r) => iso(r.nextChargeAt) },
        { header: "Last Charge", value: (r) => iso(r.lastChargeAt) },
        { header: "Status", value: (r) => r.status },
      ];
      return buildCsvExport(subs, columns);
    }
    case "failed-payments": {
      const charges = await prisma.billingCharge.findMany({ where: { status: "FAILED" }, orderBy: { attemptedAt: "desc" }, take: 5000 });
      const orgIds = [...new Set(charges.map((c) => c.organizationId))];
      const churches = await prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
      const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));
      const columns: CsvColumn<(typeof charges)[number]>[] = [
        { header: "Organization", value: (r) => safe(nameByOrg.get(r.organizationId) || "") },
        { header: "Organization ID", value: (r) => r.organizationId },
        { header: "Charge Type", value: (r) => r.chargeType },
        { header: "Amount", value: (r) => String(r.amountCents / 100) },
        { header: "Failure Code", value: (r) => safe(r.failureCode || "") },
        { header: "Failure Message", value: (r) => safe(r.failureMessage || "") },
        { header: "Attempted", value: (r) => iso(r.attemptedAt) },
      ];
      return buildCsvExport(charges, columns);
    }
    case "current-client-grants": {
      const entitlements = await prisma.promotionEntitlement.findMany({ where: { status: { in: ["ACTIVE", "ENDING_SOON"] } }, orderBy: { grantedAt: "desc" }, take: 5000 });
      const orgIds = [...new Set(entitlements.map((e) => e.organizationId))];
      const promoIds = [...new Set(entitlements.map((e) => e.promotionId))];
      const [churches, promotions] = await Promise.all([
        prisma.church.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
        prisma.promotion.findMany({ where: { id: { in: promoIds } }, select: { id: true, code: true } }),
      ]);
      const nameByOrg = new Map(churches.map((c) => [c.id, c.name]));
      const codeByPromo = new Map(promotions.map((p) => [p.id, p.code]));
      const columns: CsvColumn<(typeof entitlements)[number]>[] = [
        { header: "Organization", value: (r) => safe(nameByOrg.get(r.organizationId) || "") },
        { header: "Organization ID", value: (r) => r.organizationId },
        { header: "Promotion Code", value: (r) => safe(codeByPromo.get(r.promotionId) || "") },
        { header: "Source", value: (r) => r.source },
        { header: "Status", value: (r) => r.status },
        { header: "Granted At", value: (r) => iso(r.grantedAt) },
        { header: "Ends At", value: (r) => iso(r.endsAt) },
        { header: "Reason", value: (r) => safe(r.approvalReason || "") },
      ];
      return buildCsvExport(entitlements, columns);
    }
    case "invoice-usage": {
      const events = await prisma.invoiceUsageEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 5000 });
      const columns: CsvColumn<(typeof events)[number]>[] = [
        { header: "Organization ID", value: (r) => r.organizationId },
        { header: "Invoice ID", value: (r) => r.invoiceId },
        { header: "Event Type", value: (r) => r.eventType },
        { header: "Occurred", value: (r) => iso(r.occurredAt) },
        { header: "Invoice Amount", value: (r) => (r.invoiceAmountCents != null ? String(r.invoiceAmountCents / 100) : "") },
        { header: "Amount Paid", value: (r) => (r.amountPaidCents != null ? String(r.amountPaidCents / 100) : "") },
        { header: "Billable", value: (r) => String(r.billable) },
        { header: "Billing Period", value: (r) => safe(r.billingPeriod || "") },
      ];
      return buildCsvExport(events, columns);
    }
    case "audit-history": {
      const entries = await prisma.wgcBillingAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      const columns: CsvColumn<(typeof entries)[number]>[] = [
        { header: "Timestamp", value: (r) => iso(r.createdAt) },
        { header: "Actor Email", value: (r) => safe(r.actorEmail || "") },
        { header: "Actor Role", value: (r) => safe(r.actorRole || "") },
        { header: "Action", value: (r) => safe(r.action) },
        { header: "Entity Type", value: (r) => safe(r.entityType || "") },
        { header: "Entity ID", value: (r) => r.entityId || "" },
        { header: "Organization ID", value: (r) => r.organizationId || "" },
        { header: "Internal Reason", value: (r) => safe(r.internalReason || "") },
      ];
      return buildCsvExport(entries, columns);
    }
  }
}
