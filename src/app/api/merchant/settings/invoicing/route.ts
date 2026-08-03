import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { INVOICE_TEMPLATES } from "@/lib/invoices/invoiceBranding";

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const settings = await prisma.invoiceSettings.upsert({ where: { churchId: auth.churchId }, create: { churchId: auth.churchId }, update: {} });
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageInvoiceSettings");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const body = await req.json();

  const invoiceNumberPrefix = cleanString(body.invoiceNumberPrefix, 20) || "INV-";
  if (!/^[A-Za-z0-9\-_]{1,20}$/.test(invoiceNumberPrefix)) {
    return NextResponse.json({ error: "Invoice number prefix may only contain letters, numbers, hyphens, and underscores." }, { status: 400 });
  }

  // Protects the numbering sequence from ever moving backward, which
  // could collide with an already-issued invoice number, per "Protect
  // sequence editing so invoice numbers cannot collide."
  if (body.nextInvoiceSequence != null) {
    const requested = Number(body.nextInvoiceSequence);
    const current = await prisma.invoiceSettings.findUnique({ where: { churchId: auth.churchId }, select: { nextInvoiceSequence: true } });
    if (!Number.isFinite(requested) || requested < 1) {
      return NextResponse.json({ error: "Next invoice sequence must be a positive number." }, { status: 400 });
    }
    if (current && requested < current.nextInvoiceSequence) {
      return NextResponse.json({ error: "The next invoice sequence cannot be moved backward — this could collide with an already-issued invoice number." }, { status: 400 });
    }
  }

  const templateName = INVOICE_TEMPLATES.includes(body.defaultTemplateName) ? body.defaultTemplateName : undefined;

  const settings = await prisma.invoiceSettings.upsert({
    where: { churchId: auth.churchId },
    create: { churchId: auth.churchId },
    update: {
      invoiceNumberPrefix,
      ...(body.nextInvoiceSequence != null ? { nextInvoiceSequence: Number(body.nextInvoiceSequence) } : {}),
      defaultDueDays: Number.isFinite(Number(body.defaultDueDays)) ? Math.max(0, Number(body.defaultDueDays)) : undefined,
      defaultMemo: cleanString(body.defaultMemo, 2000),
      defaultTerms: cleanString(body.defaultTerms, 5000),
      defaultPaymentInstructions: cleanString(body.defaultPaymentInstructions, 2000),
      defaultAllowCard: typeof body.defaultAllowCard === "boolean" ? body.defaultAllowCard : undefined,
      defaultAllowAch: typeof body.defaultAllowAch === "boolean" ? body.defaultAllowAch : undefined,
      defaultAllowApplePay: typeof body.defaultAllowApplePay === "boolean" ? body.defaultAllowApplePay : undefined,
      defaultAllowGooglePay: typeof body.defaultAllowGooglePay === "boolean" ? body.defaultAllowGooglePay : undefined,
      defaultAllowPartialPayments: typeof body.defaultAllowPartialPayments === "boolean" ? body.defaultAllowPartialPayments : undefined,
      defaultFeeCoveredBy: body.defaultFeeCoveredBy === "CLIENT" ? "CLIENT" : body.defaultFeeCoveredBy === "MERCHANT" ? "MERCHANT" : undefined,
      remindersEnabledByDefault: typeof body.remindersEnabledByDefault === "boolean" ? body.remindersEnabledByDefault : undefined,
      reminderBeforeDueDays: Number.isFinite(Number(body.reminderBeforeDueDays)) ? Math.max(0, Number(body.reminderBeforeDueDays)) : undefined,
      reminderOnDueDate: typeof body.reminderOnDueDate === "boolean" ? body.reminderOnDueDate : undefined,
      reminderAfterDueDaysJson: Array.isArray(body.reminderAfterDueDays) ? body.reminderAfterDueDays.filter((n: unknown) => Number.isFinite(Number(n))).map(Number) : undefined,
      defaultTemplateName: templateName,
      accentColor: cleanString(body.accentColor, 20),
      organizationDisplayName: cleanString(body.organizationDisplayName, 200),
      organizationLegalName: cleanString(body.organizationLegalName, 200),
      organizationAddress: cleanString(body.organizationAddress, 500),
      organizationPhone: cleanString(body.organizationPhone, 30),
      organizationSupportEmail: cleanString(body.organizationSupportEmail, 320),
      organizationWebsite: cleanString(body.organizationWebsite, 300),
      taxRegistrationNumber: cleanString(body.taxRegistrationNumber, 100),
      footerMessage: cleanString(body.footerMessage, 1000),
      thankYouMessage: cleanString(body.thankYouMessage, 1000),
      replyToEmail: cleanString(body.replyToEmail, 320),
      showWgcBranding: typeof body.showWgcBranding === "boolean" ? body.showWgcBranding : undefined,
      defaultClassification: ["GOODS_OR_SERVICES", "CHARITABLE_DONATION", "PARTIAL_DONATION"].includes(body.defaultClassification) ? body.defaultClassification : undefined,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice_settings.updated",
    entityType: "invoice_settings",
    req,
  });

  return NextResponse.json({ success: true, settings });
}
