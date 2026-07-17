import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { generateIrsLetterAccessUrl } from "@/lib/onboarding/irsLetterService";

/**
 * Generates a short-lived (5 minute) signed URL to view/download this
 * document. Never returns the storage key, bucket name, or a permanent
 * URL. Verifies a real admin session (not just middleware's fast
 * pre-check) before ever touching storage.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const intent: "view" | "download" = body.intent === "download" ? "download" : "view";

  const document = await prisma.onboardingInternalDocument.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: "This document is not available." }, { status: 404 });

  try {
    const { url, expiresInSeconds } = await generateIrsLetterAccessUrl({
      onboardingApplicationId: document.onboardingApplicationId,
      documentId: document.id,
      actorUserId: session.userId,
      actorRole: session.role,
      intent,
    });
    await prisma.auditLog.create({
      data: {
        action: intent === "download" ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED",
        actorEmail: session.email,
        metadata: { documentId: document.id },
      },
    });
    return NextResponse.json({ url, expiresInSeconds });
  } catch (err) {
    console.error("Failed to generate document access URL:", err);
    return NextResponse.json({ error: "This document is not available." }, { status: 500 });
  }
}
