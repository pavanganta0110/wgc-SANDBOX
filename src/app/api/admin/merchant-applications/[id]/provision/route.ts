import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/audit";
import { provisionChurchAndBillingGate } from "@/lib/billing/provisionChurchAndBillingGate";

/**
 * Manual retry for the "Finix approved this merchant but the Church row
 * was never created" gap (spec: this is exactly how an approved merchant
 * could go missing from the Merchants Directory with nobody notified —
 * 2026-08-15 admin bug report). Safe to call even if a Church already
 * exists — provisionChurchAccount looks one up by onboardingApplicationId
 * before creating one, so this never creates a duplicate.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await prisma.onboardingApplication.findUnique({ where: { id } });
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (app.onboardingStatus !== "APPROVED") {
    return NextResponse.json({ error: "This application has not been approved by Finix yet." }, { status: 400 });
  }

  if (!app.finixMerchantId) {
    return NextResponse.json({ error: "This application has no Finix merchant ID on file — cannot provision." }, { status: 400 });
  }

  try {
    const provisioned = await provisionChurchAndBillingGate({
      id: app.id,
      organizationName: app.organizationName,
      legalBusinessName: app.legalBusinessName,
      contactEmail: app.contactEmail,
      contactName: app.contactName,
      finixMerchantId: app.finixMerchantId,
      finixIdentityId: app.finixIdentityId,
      finixApplicationId: app.finixApplicationId,
    });

    await createAuditLog({
      action: "ADMIN_MANUALLY_PROVISIONED_CHURCH",
      actorEmail: session.email,
      onboardingApplicationId: app.id,
      metadata: { churchId: provisioned.church.id },
    });

    return NextResponse.json({ success: true, churchId: provisioned.church.id });
  } catch (err: any) {
    console.error("Manual church provisioning failed:", err);
    return NextResponse.json({ error: err?.message || "Provisioning failed. Check server logs for details." }, { status: 500 });
  }
}
