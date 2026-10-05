import { NextResponse } from "next/server";
import { getCurrentIrsLetter, generateIrsLetterAccessUrl } from "@/lib/onboarding/irsLetterService";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Admin-only: generates a short-lived (5 minute) signed URL to view or
 * download the current IRS letter version. Never returns the storage key,
 * bucket name, or a permanent URL — and never logs the signed URL itself,
 * only the fact that access occurred (see generateIrsLetterAccessUrl's
 * audit call).
 *
 * Auth: requires a real, DB-backed admin session via getAdminSession() —
 * middleware.ts's own cookie check is signature/expiry-only (this file's
 * previous comment claiming HTTP Basic Auth gates this route was stale;
 * this codebase has used signed session cookies for years, not Basic
 * Auth) and never revokes a disabled admin's or a just-password-reset
 * admin's existing session on its own. The audit trail now also records
 * the real admin's own id/email instead of the generic "wgc_admin"
 * placeholder this route previously always used.
 */
export async function POST(req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      actorUserId: session.userId,
      actorRole: session.role,
      intent,
    });
    return NextResponse.json({ url, expiresInSeconds });
  } catch (err) {
    console.error("Failed to generate IRS letter access URL:", err);
    return NextResponse.json({ error: "This document is not available." }, { status: 500 });
  }
}
