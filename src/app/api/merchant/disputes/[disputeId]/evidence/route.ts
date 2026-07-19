import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

// Matches Finix's documented constraints for dispute evidence:
// docs.finix.com/guides/after-the-payment/disputes/responding-disputes
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
export const MAX_FILES_PER_DISPUTE = 8;
export const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB combined

export async function POST(req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDisputePermissions(auth.rawRole);
  if (!permissions.canUpload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId } = await params;
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId: auth.churchId },
    include: { evidence: { where: { deletedAt: null } } },
  });
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }
  if (dispute.respondedAt) {
    return NextResponse.json({ error: "Evidence is locked after the response has been submitted." }, { status: 409 });
  }
  if (dispute.evidence.length >= MAX_FILES_PER_DISPUTE) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES_PER_DISPUTE} evidence files per dispute.` }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF are allowed." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 1MB per file." }, { status: 400 });
  }
  const existingTotal = dispute.evidence.reduce((sum, e) => sum + e.fileSize, 0);
  if (existingTotal + file.size > MAX_TOTAL_SIZE) {
    return NextResponse.json({ error: "Combined evidence size cannot exceed 10MB." }, { status: 400 });
  }

  let finixFileId: string | null = null;
  try {
    const result = await finixClient.uploadDisputeEvidence(dispute.finixDisputeId, file);
    finixFileId = result?.id ?? null;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upload evidence" }, { status: 502 });
  }

  const evidence = await prisma.disputeEvidence.create({
    data: {
      disputeId: dispute.id,
      churchId: auth.churchId,
      uploadedByEmail: auth.email,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      finixFileId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "dispute.evidence_uploaded",
    entityType: "dispute",
    entityId: dispute.finixDisputeId,
    metadata: { fileName: file.name, fileSize: file.size },
    req,
  });

  return NextResponse.json({ success: true, evidence });
}
