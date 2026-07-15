import { NextResponse } from "next/server";
import { getCurrentIrsLetter, generateIrsLetterAccessUrl } from "@/lib/onboarding/irsLetterService";

/**
 * Admin-only: generates a short-lived (5 minute) signed URL to view or
 * download the current IRS letter version. Never returns the storage key,
 * bucket name, or a permanent URL — and never logs the signed URL itself,
 * only the fact that access occurred (see generateIrsLetterAccessUrl's
 * audit call).
 *
 * Auth: this whole /api/admin/* path family is gated by middleware.ts's
 * HTTP Basic Auth (ADMIN_USERNAME/ADMIN_PASSWORD) before any request
 * reaches here — the same pattern every other /api/admin/* route in this
 * codebase already relies on (none of them do their own session check).
 * Basic Auth carries no per-admin identity, so the audit trail records
 * the actor as "wgc_admin" rather than a specific user id, consistent
 * with how MerchantDocument.uploadedBy already stores "ADMIN" rather than
 * a real user id for admin-side actions.
 */
export async function POST(req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const body = await req.json().catch(() => ({}));
  const intent: "view" | "download" = body.intent === "download" ? "download" : "view";

  const document = await getCurrentIrsLetter(applicationId);
  if (!document) {
    return NextResponse.json({ error: "This document is not available." }, { status: 404 });
  }

  try {
    const { url, expiresInSeconds } = await generateIrsLetterAccessUrl({
      onboardingApplicationId: applicationId,
      documentId: document.id,
      actorUserId: "wgc_admin",
      actorRole: "wgc_admin",
      intent,
    });
    return NextResponse.json({ url, expiresInSeconds });
  } catch (err) {
    console.error("Failed to generate IRS letter access URL:", err);
    return NextResponse.json({ error: "This document is not available." }, { status: 500 });
  }
}
