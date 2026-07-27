import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewOwnTransactions");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const donation = await prisma.externalDonation.findFirst({
    where: { id, churchId: auth.churchId },
    include: { auditLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ donation });
}

const EDITABLE_FIELDS = [
  "donationAmountCents",
  "donationDate",
  "fundId",
  "fundName",
  "campaign",
  "givingPageLabel",
  "donationPurpose",
  "externalTransactionId",
  "confirmationNumber",
  "accountOrDestinationLabel",
  "providerFeeCents",
  "netAmountReceivedCents",
  "internalNote",
  "checkNumber",
  "checkDate",
  "bankName",
  "depositStatus",
  "terminalOrProviderName",
  "lastFourDigits",
  "cardType",
  "includeInAnnualStatement",
  "status",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditExternalDonation");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const existing = await prisma.externalDonation.findFirst({ where: { id, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "VOIDED") {
    return NextResponse.json({ error: "This donation has been voided and can no longer be edited." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const value = body[field];
      data[field] = field === "checkDate" || field === "donationDate" ? (value ? new Date(value) : null) : value;
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  // Edits never touch the fixed WGC-processing invariants.
  delete data.processedByWgc;
  delete data.finixTransferId;
  delete data.finixSettlementId;
  delete data.processingFeeCents;
  delete data.supplementalFeeCents;

  const updated = await prisma.externalDonation.update({ where: { id }, data });

  await prisma.externalDonationAuditLog.create({
    data: { externalDonationId: id, action: "EDITED", performedByUserId: auth.userId },
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation.edited",
    entityType: "ExternalDonation",
    entityId: id,
    metadata: { fields: Object.keys(data) },
    req,
  });

  return NextResponse.json({ donation: updated });
}
