import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { sendWgcEmail } from "@/lib/email";
import { uploadPrivateFile, createSignedDownloadUrl } from "@/lib/storage/supabaseStorage";
import { validateIrsLetterFile, computeChecksum, buildIrsLetterStorageKey } from "@/lib/onboarding/irsLetterValidation";

/**
 * All WGC-internal-document logic in one place, deliberately with no
 * import of @/lib/finix/client anywhere in this file — see
 * wgcInternalDocumentGuard.ts. This document is never attached to any
 * Finix request; it only ever touches OnboardingInternalDocument (Prisma),
 * Supabase Storage, the generic AuditLog, and organization-facing email.
 */

export interface UploadIrsLetterResult {
  documentId: string;
  version: number;
  status: string;
  originalFilename: string;
}

export async function uploadIrsLetter(params: {
  onboardingApplicationId: string;
  file: File;
  uploadedByUserId?: string | null;
}): Promise<UploadIrsLetterResult> {
  const app = await prisma.onboardingApplication.findUnique({ where: { id: params.onboardingApplicationId } });
  if (!app) throw new Error("NOT_FOUND");

  const arrayBuffer = await params.file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  const validation = validateIrsLetterFile({ mimeType: params.file.type, sizeBytes: params.file.size, bytes });
  if (!validation.valid) throw new Error(validation.error || "INVALID_FILE");

  const checksum = computeChecksum(bytes);

  const previousCurrent = await prisma.onboardingInternalDocument.findFirst({
    where: { onboardingApplicationId: app.id, documentType: "IRS_501C3_DETERMINATION_LETTER", isCurrent: true },
    orderBy: { version: "desc" },
  });
  const nextVersion = previousCurrent ? previousCurrent.version + 1 : 1;

  // documentId is minted before the storage key so the storage path can
  // include it (per the suggested path shape) — created via a throwaway
  // row id would require two round trips, so generate it client-side with
  // the same id generator Prisma's cuid() would use is unnecessary; we
  // instead let Prisma assign the id and build the storage key from the
  // application id + version, which is already unique per upload.
  const storageKey = buildIrsLetterStorageKey(app.id, `${app.id}-v${nextVersion}-${Date.now()}`, nextVersion, params.file.type);

  await uploadPrivateFile(storageKey, bytes, params.file.type);

  if (previousCurrent) {
    await prisma.onboardingInternalDocument.update({ where: { id: previousCurrent.id }, data: { isCurrent: false } });
  }

  const document = await prisma.onboardingInternalDocument.create({
    data: {
      onboardingApplicationId: app.id,
      documentType: "IRS_501C3_DETERMINATION_LETTER",
      category: "WGC_INTERNAL",
      title: "501(c)(3) IRS Determination Letter",
      originalFilename: params.file.name,
      storageProvider: "supabase_storage",
      storageKey,
      mimeType: params.file.type,
      sizeBytes: params.file.size,
      checksum,
      status: "UPLOADED",
      version: nextVersion,
      isCurrent: true,
      uploadedByUserId: params.uploadedByUserId ?? null,
    },
  });

  await createAuditLog({
    action: previousCurrent ? "onboarding.irs_letter_replaced" : "onboarding.irs_letter_uploaded",
    onboardingApplicationId: app.id,
    metadata: { documentId: document.id, version: document.version, fileType: params.file.type, sizeBytes: params.file.size },
  });

  await sendWgcEmail({
    to: app.contactEmail,
    subject: "Document uploaded — WGC Payments",
    title: "Document Uploaded",
    badgeText: "Uploaded",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>Your IRS determination letter has been uploaded successfully.</p>`,
  }).catch((err) => console.error("Failed to send IRS letter upload confirmation email:", err));

  return { documentId: document.id, version: document.version, status: document.status, originalFilename: document.originalFilename };
}

export async function getCurrentIrsLetter(onboardingApplicationId: string) {
  return prisma.onboardingInternalDocument.findFirst({
    where: { onboardingApplicationId, documentType: "IRS_501C3_DETERMINATION_LETTER", isCurrent: true },
    orderBy: { version: "desc" },
  });
}

export async function generateIrsLetterAccessUrl(params: {
  onboardingApplicationId: string;
  documentId: string;
  actorUserId: string;
  actorRole: string;
  intent: "view" | "download";
}): Promise<{ url: string; expiresInSeconds: number }> {
  const document = await prisma.onboardingInternalDocument.findFirst({
    where: { id: params.documentId, onboardingApplicationId: params.onboardingApplicationId },
  });
  if (!document) throw new Error("NOT_FOUND");

  const expiresInSeconds = 300;
  const url = await createSignedDownloadUrl(document.storageKey, expiresInSeconds);

  await createAuditLog({
    action: params.intent === "download" ? "onboarding.irs_letter_downloaded" : "onboarding.irs_letter_viewed",
    onboardingApplicationId: params.onboardingApplicationId,
    actorEmail: undefined,
    metadata: { documentId: document.id, version: document.version, actorUserId: params.actorUserId, actorRole: params.actorRole },
  });

  return { url, expiresInSeconds };
}

const REVIEW_STATUSES = new Set(["VERIFIED_BY_WGC", "NEEDS_REPLACEMENT", "REJECTED"]);

export async function reviewIrsLetter(params: {
  onboardingApplicationId: string;
  documentId: string;
  status: string;
  internalReviewNotes?: string | null;
  organizationFacingMessage?: string | null;
  reviewedByUserId: string;
}) {
  if (!REVIEW_STATUSES.has(params.status)) throw new Error("INVALID_STATUS");

  const document = await prisma.onboardingInternalDocument.findFirst({
    where: { id: params.documentId, onboardingApplicationId: params.onboardingApplicationId },
  });
  if (!document) throw new Error("NOT_FOUND");

  const previousStatus = document.status;

  const updated = await prisma.onboardingInternalDocument.update({
    where: { id: document.id },
    data: {
      status: params.status,
      internalReviewNotes: params.internalReviewNotes ?? document.internalReviewNotes,
      organizationFacingMessage: params.organizationFacingMessage ?? document.organizationFacingMessage,
      reviewedByUserId: params.reviewedByUserId,
      reviewedAt: new Date(),
    },
  });

  const auditAction =
    params.status === "VERIFIED_BY_WGC" ? "onboarding.irs_letter_verified" : params.status === "NEEDS_REPLACEMENT" ? "onboarding.irs_letter_needs_replacement" : "onboarding.irs_letter_rejected";

  await createAuditLog({
    action: auditAction,
    onboardingApplicationId: params.onboardingApplicationId,
    metadata: { documentId: document.id, version: document.version, previousStatus, newStatus: params.status, reviewedByUserId: params.reviewedByUserId },
  });

  const app = await prisma.onboardingApplication.findUnique({ where: { id: params.onboardingApplicationId } });
  if (app) {
    await sendIrsLetterStatusEmail(app.contactEmail, params.status, params.organizationFacingMessage).catch((err) =>
      console.error("Failed to send IRS letter review notification email:", err),
    );
  }

  return updated;
}

async function sendIrsLetterStatusEmail(to: string, status: string, organizationFacingMessage: string | null | undefined) {
  const copy: Record<string, { title: string; badgeText: string; badgeColor: string; body: string }> = {
    VERIFIED_BY_WGC: {
      title: "Document Verified",
      badgeText: "Verified",
      badgeColor: "#10B981",
      body: "Your IRS determination letter has been verified.",
    },
    NEEDS_REPLACEMENT: {
      title: "Document Needs Replacement",
      badgeText: "Action Needed",
      badgeColor: "#F59E0B",
      body: "WGC could not verify the document. Please upload a clearer or updated copy.",
    },
    REJECTED: {
      title: "Document Rejected",
      badgeText: "Rejected",
      badgeColor: "#EF4444",
      body: "Your IRS determination letter could not be accepted. Please contact support for next steps.",
    },
  };
  const entry = copy[status];
  if (!entry) return;

  await sendWgcEmail({
    to,
    subject: `${entry.title} — WGC Payments`,
    title: entry.title,
    badgeText: entry.badgeText,
    badgeColor: entry.badgeColor,
    bodyHtml: `<p>${entry.body}</p>${organizationFacingMessage ? `<p>${organizationFacingMessage}</p>` : ""}`,
  });
}
