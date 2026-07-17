import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { reviewIrsLetter } from "@/lib/onboarding/irsLetterService";

const VALID_STATUSES = ["VERIFIED_BY_WGC", "NEEDS_REPLACEMENT", "REJECTED"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, internalReviewNotes, organizationFacingMessage } = body;

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
  }

  const document = await prisma.onboardingInternalDocument.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  try {
    const updated = await reviewIrsLetter({
      onboardingApplicationId: document.onboardingApplicationId,
      documentId: document.id,
      status,
      internalReviewNotes: typeof internalReviewNotes === "string" ? internalReviewNotes : undefined,
      organizationFacingMessage: typeof organizationFacingMessage === "string" ? organizationFacingMessage : undefined,
      reviewedByUserId: session.userId,
    });

    await prisma.auditLog.create({
      data: {
        action: status === "VERIFIED_BY_WGC" ? "DOCUMENT_APPROVED" : status === "REJECTED" ? "DOCUMENT_REJECTED" : "DOCUMENT_STATUS_UPDATED",
        actorEmail: session.email,
        metadata: { documentId: document.id, status },
      },
    });

    return NextResponse.json({ document: updated });
  } catch (err: any) {
    console.error("Document review failed:", err);
    return NextResponse.json({ error: "Failed to update document review." }, { status: 500 });
  }
}
