import { finixClient } from "@/lib/finix/client";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Reuses the same Finix File Resource pattern as onboarding document
 * uploads (src/app/api/onboarding/upload/route.ts) — there's no generic
 * S3/local file store in this codebase, so every uploaded file goes
 * through the processor's file storage rather than inventing a new one.
 */
export async function uploadTicketAttachment(file: File, finixMerchantId: string) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type. Only JPG, PNG, and PDF are allowed.");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("File too large. Maximum size is 10MB.");
  }

  const fileResource = await finixClient.createFileResource({
    display_name: file.name,
    linked_to: finixMerchantId,
    type: "ADDITIONAL_DOCUMENTATION",
  });
  const finixFileId = fileResource.id;
  if (!finixFileId) throw new Error("Failed to store attachment.");

  await finixClient.uploadFileContent(finixFileId, file);

  return { finixFileId, fileName: file.name, fileSize: file.size, mimeType: file.type };
}
