import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { finixClient } from "@/lib/finix/client";
import { extractRequestedFileType } from "@/lib/finix/parseVerificationOutcomes";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";

// Matches UpdateForm.tsx's field-naming convention: each upload slot is
// submitted as `file__<finixFileType>` (finixFileType may be the empty
// string for the generic single-slot fallback), so more than one
// differently-typed document can be submitted in the same request
// (2026-09-04 finding: Finix can request several distinct documents at
// once — e.g. a bank statement AND an EDD document — and a single
// unlabeled file input can't say which upload is for which).
const FILE_FIELD_PREFIX = "file__";
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;

    const filesToUpload: { finixFileType: string; file: File }[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith(FILE_FIELD_PREFIX) && value instanceof File) {
        filesToUpload.push({ finixFileType: key.slice(FILE_FIELD_PREFIX.length) || "ADDITIONAL_DOCUMENTATION", file: value });
      }
    }
    // Legacy fallback: an in-flight request from a page served just
    // before this deploy may still submit the old single unprefixed
    // `file` field — honored the same way it always was (type resolved
    // from the stored Verification, if any).
    const legacyFile = formData.get("file");
    if (legacyFile instanceof File) {
      filesToUpload.push({ finixFileType: "", file: legacyFile }); // resolved below once `app` is loaded
    }

    // "Update Data" style underwriting requests (DBA, ownership/business
    // type, MCC, email) have no document to upload at all — previously
    // this route required a file unconditionally, so a merchant asked only
    // for a field correction had no way to submit anything (2026-09-04
    // finding: Finix's own UPDATE_REQUESTED outcomes for a real merchant
    // were mostly "Update Data", not "Upload File"). These map to Finix's
    // real Identity.entity fields, confirmed against this same codebase's
    // own onboarding-creation payload (see route.ts's identityPayload).
    const doingBusinessAs = (formData.get("doingBusinessAs") as string | null)?.trim() || undefined;
    const businessType = (formData.get("businessType") as string | null)?.trim() || undefined;
    const mcc = (formData.get("mcc") as string | null)?.trim() || undefined;
    const email = (formData.get("email") as string | null)?.trim() || undefined;
    const hasFieldUpdates = Boolean(doingBusinessAs || businessType || mcc || email);

    if (!token || (filesToUpload.length === 0 && !hasFieldUpdates)) {
      return NextResponse.json({ error: "Missing token, and no file or field update provided" }, { status: 400 });
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

    if (hasFieldUpdates && !app.finixIdentityId) {
      return NextResponse.json({ error: "Configuration error: Identity missing." }, { status: 400 });
    }

    // Resolve the legacy field's type now that `app` is loaded, and
    // validate every file.
    for (const entry of filesToUpload) {
      if (entry.finixFileType === "") {
        entry.finixFileType = extractRequestedFileType(app.updateRequestedCodes) || "ADDITIONAL_DOCUMENTATION";
      }
      if (!ALLOWED_FILE_TYPES.includes(entry.file.type)) {
        return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF are allowed." }, { status: 400 });
      }
      if (entry.file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
      }
    }

    // Only two business_type values are ever sent by this platform's own
    // onboarding-creation flow (src/app/api/onboarding/route.ts) — churches
    // are always TAX_EXEMPT_ORGANIZATION. Reject anything else outright
    // rather than forwarding an unvalidated string to Finix's Identity API.
    if (businessType && businessType !== "TAX_EXEMPT_ORGANIZATION" && businessType !== "CORPORATION") {
      return NextResponse.json({ error: "Invalid ownership type." }, { status: 400 });
    }

    // 1. Push any requested field corrections to the Finix Identity first —
    // these are independent of the file upload(s) below and Finix
    // re-reviews everything together once the single verification trigger
    // (step 3) fires.
    if (hasFieldUpdates && app.finixIdentityId) {
      const entity: Record<string, string> = {};
      if (doingBusinessAs) entity.doing_business_as = doingBusinessAs;
      if (businessType) entity.business_type = businessType;
      if (mcc) entity.mcc = mcc;
      if (email) entity.email = email;
      await finixClient.updateIdentity(app.finixIdentityId, { entity });
    }

    // 2. Create a File Resource + upload content in Finix for every
    // submitted file, each tagged with its own real Finix file type
    // (e.g. "ENHANCED_DUE_DILIGENCE_DOCUMENT") rather than one generic
    // type for all of them.
    const uploadedDocuments: { finixFileId: string; finixFileType: string; file: File }[] = [];
    for (const { finixFileType, file } of filesToUpload) {
      const fileResource = await finixClient.createFileResource({
        display_name: file.name,
        linked_to: app.finixMerchantId,
        type: finixFileType
      });
      const finixFileId = fileResource.id;
      if (!finixFileId) {
        throw new Error("Failed to create file resource in Finix.");
      }
      await finixClient.uploadFileContent(finixFileId, file);
      uploadedDocuments.push({ finixFileId, finixFileType, file });
    }

    // 3. Trigger a new Verification if Identity exists — once, regardless
    // of how many files and/or field updates this submission included.
    if (app.finixIdentityId) {
      try {
        await finixClient.createVerification(app.finixIdentityId);
      } catch (err) {
        console.warn("Could not trigger verification directly. Finix might auto-trigger it.", err);
      }
    }

    // 4. Create an Audit Record per uploaded document (MerchantDocument is
    // document-shaped; field-update changes are captured in the admin
    // email below instead of a new table for this initial gap-fix).
    for (const { finixFileId, finixFileType, file } of uploadedDocuments) {
      await prisma.merchantDocument.create({
        data: {
          onboardingApplicationId: app.id,
          documentType: finixFileType,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          uploadStatus: "SUCCESS",
          finixFileId: finixFileId,
          uploadedBy: "MERCHANT",
        }
      });
    }

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
    const fieldsUpdated = [
      doingBusinessAs ? "DBA" : null,
      businessType ? "Ownership Type" : null,
      mcc ? "MCC" : null,
      email ? "Email" : null,
    ].filter((f): f is string => Boolean(f));
    const whatChanged = [
      uploadedDocuments.length > 0 ? `document(s): ${uploadedDocuments.map((d) => d.file.name).join(", ")}` : null,
      fieldsUpdated.length > 0 ? `field update(s): ${fieldsUpdated.join(", ")}` : null,
    ].filter(Boolean).join(" and ");

    await sendWgcAdminEmail({
      merchantName: safeOrgName,
      contactEmail: app.contactEmail,
      finixMerchantId: app.finixMerchantId || undefined,
      finixIdentityId: app.finixIdentityId || undefined,
      newStatus: "UNDER_REVIEW",
      documentsUploaded: uploadedDocuments.length > 0 ? uploadedDocuments.map((d) => d.file.name).join(", ") : undefined,
      whatHappened: `The merchant submitted ${whatChanged} via the secure link. A new verification was triggered.`,
      actionNeeded: "Wait for Finix to review the new verification.",
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
      customSubject: `Merchant submitted requested information — ${safeOrgName}`
    });

    return NextResponse.json({ success: true, message: "Information submitted successfully." });
  } catch (error: unknown) {
    console.error("Secure upload error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
