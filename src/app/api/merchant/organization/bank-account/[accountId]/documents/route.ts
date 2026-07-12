import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

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
  return NextResponse.json({ documents });
}

/**
 * Uploads a document for a payout account that Finix has flagged as
 * REQUIRES_ACTION. Reuses the same Finix File Resource pattern as onboarding
 * document uploads and support ticket attachments — no generic file store
 * exists in this codebase, so this goes through the processor's own file
 * storage rather than inventing a new one.
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

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "This organization can't accept document uploads yet" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string | null)?.trim() || null;

  if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF are allowed." }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });

  const { finixClient } = await import("@/lib/finix/client");
  const fileResource = await finixClient.createFileResource({
    display_name: file.name,
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
      fileName: file.name,
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
    metadata: { fileName: file.name, label },
    req,
  });

  return NextResponse.json({ document }, { status: 201 });
}
