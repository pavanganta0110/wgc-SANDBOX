import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { finixClient } from "@/lib/finix/client";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;
    const file = formData.get("file") as File;

    if (!token || !file) {
      return NextResponse.json({ error: "Missing token or file" }, { status: 400 });
    }

    // Hash the provided token to compare with database
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const app = await prisma.onboardingApplication.findFirst({
      where: {
        updateTokenHash: tokenHash,
        updateTokenExpiresAt: {
          gt: new Date() // Token must not be expired
        }
      }
    });

    if (!app) {
      return NextResponse.json({ error: "Invalid or expired secure link." }, { status: 403 });
    }

    if (!app.finixMerchantId) {
      return NextResponse.json({ error: "Configuration error: Merchant missing." }, { status: 400 });
    }

    // Validate file
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF are allowed." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    // 1. Create File Resource in Finix
    const fileResource = await finixClient.createFileResource({
      display_name: file.name,
      linked_to: app.finixMerchantId,
      type: "ADDITIONAL_DOCUMENTATION"
    });

    const finixFileId = fileResource.id;
    if (!finixFileId) {
      throw new Error("Failed to create file resource in Finix.");
    }

    // 2. Upload File Content to Finix
    await finixClient.uploadFileContent(finixFileId, file);

    // 3. Trigger a new Verification if Identity exists
    if (app.finixIdentityId) {
      try {
        await finixClient.createVerification(app.finixIdentityId);
      } catch (err) {
        console.warn("Could not trigger verification directly. Finix might auto-trigger it.", err);
      }
    }

    // 4. Create Audit Record
    await prisma.merchantDocument.create({
      data: {
        onboardingApplicationId: app.id,
        documentType: "ADDITIONAL_DOCUMENTATION",
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadStatus: "SUCCESS",
        finixFileId: finixFileId,
        uploadedBy: "MERCHANT",
      }
    });

    // 5. Update Database Status & Invalidate Token
    await prisma.onboardingApplication.update({
      where: { id: app.id },
      data: {
        onboardingStatus: "UNDER_REVIEW",
        lastUpdateSubmittedAt: new Date(),
        lastStatusChangedAt: new Date(),
        updateTokenHash: null,
        updateTokenExpiresAt: null
      }
    });

    // 6. Send Email to Merchant
    const safeOrgName = app.organizationName || "your organization";
    await sendWgcEmail({
      to: app.contactEmail,
      subject: "Additional information received — WGC Payments",
      title: "Additional information received",
      badgeText: "Under Review",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>We have received the additional information for your WGC Payments account for <strong>${safeOrgName}</strong>.</p>
                 <p>Your application has been resubmitted for review. We will notify you once the review is completed or if any further information is required.</p>`
    });

    // 7. Send Email to Admin
    await sendWgcAdminEmail({
      merchantName: safeOrgName,
      contactEmail: app.contactEmail,
      finixMerchantId: app.finixMerchantId || undefined,
      finixIdentityId: app.finixIdentityId || undefined,
      newStatus: "UNDER_REVIEW",
      documentsUploaded: file.name,
      whatHappened: "The merchant successfully uploaded a document via the secure link. A new verification was triggered.",
      actionNeeded: "Wait for Finix to review the new verification.",
      adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications",
      customSubject: `Merchant documents submitted — ${safeOrgName}`
    });

    return NextResponse.json({ success: true, message: "Documents submitted successfully." });
  } catch (error: any) {
    console.error("Secure upload error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
