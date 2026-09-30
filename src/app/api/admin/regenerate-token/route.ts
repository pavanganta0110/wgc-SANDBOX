import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendWgcEmail, buildOnboardingStatusEmailContent } from "@/lib/email";
import { getAdminSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      return NextResponse.json({ error: "Missing applicationId" }, { status: 400 });
    }

    const app = await prisma.onboardingApplication.findUnique({
      where: { id: applicationId }
    });

    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Generate new secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.onboardingApplication.update({
      where: { id: app.id },
      data: {
        updateTokenHash: tokenHash,
        updateTokenExpiresAt: expiresAt,
        onboardingStatus: "MORE_INFORMATION_REQUIRED"
      }
    });

    const secureLink = `https://www.wgcpayments.com/onboarding/update/${rawToken}`;

    const { subject, title, badgeText, badgeColor, bodyHtml } = buildOnboardingStatusEmailContent(
      "MORE_INFORMATION_REQUIRED",
      app.organizationName || app.legalBusinessName,
      { requestedItems: app.updateRequestedItems, secureLink }
    );

    await sendWgcEmail({ to: app.contactEmail, subject, title, badgeText, badgeColor, bodyHtml });

    return NextResponse.json({ success: true, message: "Token regenerated and email sent." });
  } catch (error: unknown) {
    console.error("Regenerate token error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
