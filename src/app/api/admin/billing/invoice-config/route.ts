import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

const VALID_MODES = ["DISABLED", "INCLUDED_IN_PLATFORM", "MONTHLY_ADD_ON", "PER_INVOICE_SENT", "PER_INVOICE_PAID", "FLAT_MONTHLY_PLUS_USAGE"];

/** Admin -> Billing & Subscriptions -> Invoice Billing. Starts DISABLED —
 * every new InvoiceBillingConfiguration row here is a NEW version
 * (previous ones are retired, never edited in place), and effectiveFrom is
 * always now-or-later — never backdated, so activating a price here can
 * never retroactively bill InvoiceUsageEvent rows recorded before this
 * moment (see invoiceUsageLedger.ts, which only ever looks at the
 * currently-ACTIVE configuration). */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [active, history] = await Promise.all([
    prisma.invoiceBillingConfiguration.findFirst({ where: { status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" } }),
    prisma.invoiceBillingConfiguration.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ active, history });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManageInvoiceBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { mode, monthlyAmountCents, usageAmountCents, trigger, partialPaymentCountsAsBillable, promotionWaivesInvoiceFees, customerFacingDescription, confirmed, reason } = body;

  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: "Invalid invoice billing mode." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to change invoice billing configuration." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const previous = await tx.invoiceBillingConfiguration.findFirst({ where: { status: "ACTIVE" } });
    if (previous) {
      await tx.invoiceBillingConfiguration.update({ where: { id: previous.id }, data: { status: "RETIRED", effectiveUntil: new Date() } });
    }
    const created = await tx.invoiceBillingConfiguration.create({
      data: {
        mode,
        monthlyAmountCents: monthlyAmountCents ?? null,
        usageAmountCents: usageAmountCents ?? null,
        trigger: trigger || null,
        partialPaymentCountsAsBillable: Boolean(partialPaymentCountsAsBillable),
        promotionWaivesInvoiceFees: Boolean(promotionWaivesInvoiceFees),
        customerFacingDescription: customerFacingDescription || null,
        effectiveFrom: new Date(),
        status: mode === "DISABLED" ? "DRAFT" : "ACTIVE",
        createdByUserId: session.userId,
        activatedByUserId: mode !== "DISABLED" ? session.userId : null,
        activatedAt: mode !== "DISABLED" ? new Date() : null,
      },
    });
    return { previous, created };
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: mode === "DISABLED" ? "invoice_pricing.created_draft" : "invoice_pricing.activated",
    entityType: "InvoiceBillingConfiguration",
    entityId: result.created.id,
    previousValue: result.previous ? { mode: result.previous.mode, status: result.previous.status } : undefined,
    newValue: { mode, monthlyAmountCents, usageAmountCents },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, configuration: result.created });
}
