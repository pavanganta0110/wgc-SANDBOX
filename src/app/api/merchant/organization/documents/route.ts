import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function GET() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { onboardingApplicationId: true } });
  if (!church?.onboardingApplicationId) return NextResponse.json({ documents: [] });

  const documents = await prisma.merchantDocument.findMany({
    where: { onboardingApplicationId: church.onboardingApplicationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUploadDocuments) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({
    where: { id: session.churchId },
    select: { onboardingApplicationId: true, finixMerchantId: true },
  });
  if (!church?.onboardingApplicationId || !church.finixMerchantId) {
    return NextResponse.json({ error: "This organization can't accept document uploads yet" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentType = (formData.get("documentType") as string | null) || "ADDITIONAL_DOCUMENTATION";

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

  const document = await prisma.merchantDocument.create({
    data: {
      onboardingApplicationId: church.onboardingApplicationId,
      documentType,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadStatus: "SUCCESS",
      finixFileId,
      uploadedBy: "MERCHANT",
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.document_uploaded",
    entityType: "merchant_document",
    entityId: document.id,
    metadata: { fileName: file.name, documentType },
    req,
  });

  return NextResponse.json({ document }, { status: 201 });
}
