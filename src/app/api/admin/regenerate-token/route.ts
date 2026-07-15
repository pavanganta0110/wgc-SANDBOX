import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendWgcEmail } from "@/lib/email";

export async function POST(req: Request) {
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

    const secureLink = `https://wgcpayments.com/onboarding/update/${rawToken}`;
    const safeOrgName = app.organizationName || "your organization";

    let requestedItemsStr = app.updateRequestedItems || "Additional documentation is required to verify your business and identity.";

    await sendWgcEmail({
      to: app.contactEmail,
      subject: "Additional information needed for your WGC Payments account",
      title: "Additional information is required",
      badgeText: "Action Required",
      badgeColor: "#F59E0B",
      bodyHtml: `<p>We need additional information to continue reviewing your WGC Payments account for <strong>${safeOrgName}</strong>.</p>
                 <p><strong>Requested items:</strong><br/>${requestedItemsStr}</p>
                 <p>Please use the secure link below to submit the requested information.</p>
                 <p><a href="${secureLink}">Submit Required Information</a></p>`
    });

    return NextResponse.json({ success: true, message: "Token regenerated and email sent." });
  } catch (error: any) {
    console.error("Regenerate token error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
