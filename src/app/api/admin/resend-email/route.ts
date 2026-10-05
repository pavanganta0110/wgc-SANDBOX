import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail, buildOnboardingStatusEmailContent } from "@/lib/email";
import { getAdminSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      return NextResponse.json({ error: "Application ID is required" }, { status: 400 });
    }

    const app = await prisma.onboardingApplication.findUnique({
      where: { id: applicationId }
    });

    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const contactEmail = app.contactEmail;
    const status = app.onboardingStatus;

    let secureLink: string | undefined;
    if (status === "MORE_INFORMATION_REQUIRED" || status === "ADDITIONAL_INFO_NEEDED") {
      // A resend regenerates the secure token — the previous one may be
      // expired or already invalidated by an earlier submission.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await prisma.onboardingApplication.update({
        where: { id: app.id },
        data: { updateTokenHash: tokenHash, updateTokenExpiresAt: expiresAt },
      });
      secureLink = `https://www.wgcpayments.com/onboarding/update/${rawToken}`;
    }

    const { subject, title, badgeText, badgeColor, bodyHtml } = buildOnboardingStatusEmailContent(
      status,
      // organizationName is frequently empty on real applications (this
      // codebase captures the legal name during onboarding, not always a
      // separate DBA/org name) — legalBusinessName is the fallback the
      // original MERCHANT.UPDATED webhook email already used; this resend
      // route hadn't (2026-09-04 finding: it showed "your organization"
      // instead of the church's actual name).
      app.organizationName || app.legalBusinessName,
      { requestedItems: app.updateRequestedItems, secureLink }
    );

    const response = await sendWgcEmail({
      to: contactEmail,
      subject,
      title,
      badgeText,
      badgeColor,
      bodyHtml
    });

    if (response.success) {
      await prisma.emailLog.create({
        data: {
          onboardingApplicationId: app.id,
          type: "ADMIN_RESEND_" + (status || "UNKNOWN"),
          to: contactEmail,
          subject: subject,
          status: "SENT",
          sentAt: new Date(),
          bodyHtml
        }
      });
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
  } catch (error) {
    console.error("Resend email error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
