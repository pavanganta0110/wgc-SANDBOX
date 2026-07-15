import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const file = formData.get("file") as File;
    const applicationId = formData.get("applicationId") as string;
    
    if (!file || !applicationId) {
      return NextResponse.json({ error: "Missing file or applicationId" }, { status: 400 });
    }

    // Basic file validation
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF are allowed." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max size is 10MB." }, { status: 400 });
    }

    const app = await prisma.onboardingApplication.findUnique({
      where: { id: applicationId }
    });

    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (!app.finixMerchantId) {
      return NextResponse.json({ error: "No Finix Merchant ID associated with this application" }, { status: 400 });
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
        console.warn("Could not trigger verification directly.", err);
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
        uploadedBy: "ADMIN",
      }
    });

    // 5. Update Database Status
    await prisma.onboardingApplication.update({
      where: { id: app.id },
      data: {
        onboardingStatus: "UNDER_REVIEW",
        lastStatusChangedAt: new Date(),
        updateTokenHash: null,
        updateTokenExpiresAt: null
      }
    });

    // 5. Send Email to Merchant
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

    // 6. Send Email to Admin
    await sendWgcAdminEmail({
      merchantName: safeOrgName,
      contactEmail: app.contactEmail,
      finixMerchantId: app.finixMerchantId || undefined,
      finixIdentityId: app.finixIdentityId || undefined,
      newStatus: "UNDER_REVIEW",
      documentsUploaded: file.name,
      whatHappened: "Admin successfully uploaded missing documents to Finix and triggered a new verification.",
      actionNeeded: "Wait for Finix to review the new verification.",
      adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications",
      customSubject: `Merchant documents submitted — ${safeOrgName}`
    });

    return NextResponse.json({ success: true, message: "Documents uploaded and verification triggered." });
  } catch (error: any) {
    console.error("Upload evidence error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
