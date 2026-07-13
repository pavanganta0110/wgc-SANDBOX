import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";

const RECEIPT_FIELDS = [
  "receiptAutoSend",
  "receiptSenderName",
  "receiptReplyToEmail",
  "receiptSubjectTemplate",
  "receiptHeader",
  "receiptThankYouMessage",
  "receiptFooter",
  "receiptShowAddress",
  "receiptShowPhone",
  "receiptShowEmail",
  "receiptShowFund",
  "receiptShowDonorCoveredFee",
  "receiptShowPaymentMethodLastFour",
  "receiptShowRecurringSchedule",
  "receiptShowDonationReference",
  "receiptShowTaxId",
  "receiptShowWebsite",
  "receiptDisclaimer",
  "receiptLanguage",
  "receiptSendCopyToOrg",
  "receiptSupportContact",
  "receiptNumberPrefix",
  "acknowledgmentNoGoodsServicesText",
  "acknowledgmentGoodsServicesTemplate",
] as const;

const BOOLEAN_FIELDS = new Set([
  "receiptAutoSend",
  "receiptShowAddress",
  "receiptShowPhone",
  "receiptShowEmail",
  "receiptShowFund",
  "receiptShowDonorCoveredFee",
  "receiptShowPaymentMethodLastFour",
  "receiptShowRecurringSchedule",
  "receiptShowDonationReference",
  "receiptShowTaxId",
  "receiptShowWebsite",
  "receiptSendCopyToOrg",
]);

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  return NextResponse.json({ settings: church });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;
  const body = await req.json();
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  for (const field of RECEIPT_FIELDS) {
    if (!(field in body)) continue;
    if (BOOLEAN_FIELDS.has(field)) {
      data[field] = Boolean(body[field]);
    } else if (field === "receiptReplyToEmail" || field === "receiptSupportContact") {
      const email = normalizeWhitespace(body[field]);
      if (email && !isValidEmail(email)) errors[field] = "Please enter a valid email address";
      else data[field] = email;
    } else {
      data[field] = normalizeWhitespace(body[field]);
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: errors }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const current = await prisma.church.findUnique({ where: { id: churchId } });
  const previousValues: Record<string, unknown> = {};
  for (const key of Object.keys(data)) previousValues[key] = (current as any)?.[key];

  await prisma.church.update({ where: { id: churchId }, data });

  await logDashboardAction({
    churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.receipt_settings_updated",
    entityType: "church",
    entityId: churchId,
    metadata: { section: "Receipts", changedFields: Object.keys(data), previousValues, newValues: data },
    req,
  });

  return NextResponse.json({ success: true });
}
