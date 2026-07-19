import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type (PNG, JPG, JPEG, WEBP)
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: "Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported."
      }, { status: 400 });
    }

    // Validate size (max 5MB)
    const MAX_LOGO_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json({
        error: "File too large. Maximum size is 5MB."
      }, { status: 400 });
    }

    // Get organization Finix ID
    const church = await prisma.church.findUnique({
      where: { id: auth.churchId },
      select: { finixMerchantId: true, finixIdentityId: true }
    });

    const linkedTo = church?.finixMerchantId || church?.finixIdentityId;
    if (!linkedTo) {
      return NextResponse.json({
        error: "Your organization is not initialized with a Finix account."
      }, { status: 400 });
    }

    // 1. Create File Resource in Finix with fallback search for supported type enum
    const candidateTypes = [
      "ADDITIONAL_DOCUMENTATION",
      "SUPPORTING_DOCUMENT",
      "BUSINESS_REGISTRATION_DOCUMENT",
      "BANK_STATEMENT",
      "OTHER",
      "IDENTITY_DOCUMENT"
    ];
    let fileResource = null;
    let lastError = null;

    for (const type of candidateTypes) {
      try {
        console.log(`[Logo Upload] Trying file type: ${type}`);
        fileResource = await finixClient.createFileResource({
          display_name: `logo_${Date.now()}_${file.name}`,
          linked_to: linkedTo,
          type
        });
        console.log(`[Logo Upload] Successfully created file resource using type: ${type}`);
        lastError = null;
        break;
      } catch (err: any) {
        console.warn(`[Logo Upload] Type ${type} rejected:`, err.message);
        lastError = err;
      }
    }

    if (!fileResource) {
      return NextResponse.json({
        error: `Failed to create file resource in Finix. Last error: ${lastError?.message || "Unknown error"}`
      }, { status: 502 });
    }

    const finixFileId = fileResource.id;
    if (!finixFileId) {
      return NextResponse.json({ error: "Failed to store file in Finix" }, { status: 502 });
    }

    // 2. Upload File Content to Finix
    await finixClient.uploadFileContent(finixFileId, file);

    const logoUrl = `/api/files/${finixFileId}`;

    // 3. Audit log
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "giving_link.logo_uploaded",
      entityType: "giving_link",
      metadata: { fileName: file.name, fileSize: file.size, fileId: finixFileId },
      req,
    });

    return NextResponse.json({
      success: true,
      logoUrl,
      fileName: file.name,
      fileSize: file.size,
    });

  } catch (err: any) {
    console.error("Logo upload error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
