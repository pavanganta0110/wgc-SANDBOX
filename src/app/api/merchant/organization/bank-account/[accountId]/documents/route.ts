import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import {
  PAYOUT_PROOF_ALLOWED_MIME_TYPES,
  PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL,
  PAYOUT_PROOF_MAX_FILE_SIZE_BYTES,
  PAYOUT_PROOF_MAX_FILES,
  PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES,
  sanitizeFileName,
} from "@/lib/uploads/payoutProofLimits";

// Uploads are only accepted while the account is genuinely awaiting the
// evidence it needs: SUBMITTED (the initial submission window, right after
// the bank Payment Instrument is created and before the change flow's own
// submit completes) or REQUIRES_ACTION (the processor asked for more).
// Once past that — UNDER_REVIEW, APPROVED, ACTIVE, REJECTED, HISTORICAL,
// DISABLED — the submitted evidence package is locked.
const UPLOAD_ALLOWED_STATUSES = new Set(["SUBMITTED", "REQUIRES_ACTION"]);

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.organizationBankAccount.findUnique({ where: { id: accountId } });
  if (!account || account.churchId !== session.churchId) {
    return NextResponse.json({ error: "Payout account not found" }, { status: 404 });
  }

  const documents = await prisma.payoutAccountDocument.findMany({
    where: { organizationBankAccountId: accountId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents, locked: !UPLOAD_ALLOWED_STATUSES.has(account.status) });
}

/**
 * Uploads a piece of supporting bank proof — used both for the initial
 * payout-account submission and for REQUIRES_ACTION resubmission. Reuses
 * the same Finix File Resource pattern as onboarding document uploads and
 * support ticket attachments — no generic file store exists in this
 * codebase, so this goes through the processor's own file storage rather
 * than inventing a new one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpdateBankAccount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.organizationBankAccount.findUnique({ where: { id: accountId } });
  if (!account || account.churchId !== session.churchId) {
    return NextResponse.json({ error: "Payout account not found" }, { status: 404 });
  }
  if (!UPLOAD_ALLOWED_STATUSES.has(account.status)) {
    return NextResponse.json({ error: "This account's submitted evidence is locked and can no longer accept new files." }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization can't accept document uploads yet" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string | null)?.trim() || null;

  if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!PAYOUT_PROOF_ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Invalid file type. Only ${PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL} are allowed.` }, { status: 400 });
  }
  if (file.size > PAYOUT_PROOF_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `File too large. Maximum size is ${PAYOUT_PROOF_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB per file.` }, { status: 400 });
  }

  const [existingCount, existingSizeAgg] = await Promise.all([
    prisma.payoutAccountDocument.count({ where: { organizationBankAccountId: accountId } }),
    prisma.payoutAccountDocument.aggregate({ where: { organizationBankAccountId: accountId }, _sum: { fileSize: true } }),
  ]);
  if (existingCount >= PAYOUT_PROOF_MAX_FILES) {
    return NextResponse.json({ error: `Maximum of ${PAYOUT_PROOF_MAX_FILES} files allowed.` }, { status: 400 });
  }
  const existingTotalSize = existingSizeAgg._sum.fileSize || 0;
  if (existingTotalSize + file.size > PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES) {
    return NextResponse.json({ error: "Total upload size limit exceeded." }, { status: 400 });
  }

  const safeFileName = sanitizeFileName(file.name);

  const { finixClient } = await import("@/lib/finix/client");
  const fileResource = await finixClient.createFileResource({
    display_name: safeFileName,
    linked_to: church.finixMerchantId,
    type: "ADDITIONAL_DOCUMENTATION",
  });
  const finixFileId = fileResource.id;
  if (!finixFileId) return NextResponse.json({ error: "Failed to store document" }, { status: 502 });
  await finixClient.uploadFileContent(finixFileId, file);

  const document = await prisma.payoutAccountDocument.create({
    data: {
      organizationBankAccountId: account.id,
      label,
      fileName: safeFileName,
      fileSize: file.size,
      mimeType: file.type,
      finixFileId,
      uploadedByUserId: session.userId,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.payout_documents_uploaded",
    entityType: "organization_bank_account",
    entityId: account.id,
    metadata: { fileName: safeFileName, label },
    req,
  });

  return NextResponse.json({ document }, { status: 201 });
}
