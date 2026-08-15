import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const applications = await prisma.onboardingApplication.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationName: true,
        contactEmail: true,
        finixMerchantId: true,
        finixIdentityId: true,
        onboardingStatus: true,
        onboardingState: true,
        verificationState: true,
        lastFinixEventType: true,
        lastStatusChangedAt: true,
        lastUpdateSubmittedAt: true,
        updateRequestedCodes: true,
        updateRequestedItems: true,
        rejectionReasonInternal: true,
        createdAt: true,
        finixOnboardingFormId: true,
        documents: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            createdAt: true,
            uploadedBy: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    // Church is linked by a plain onboardingApplicationId FK (no formal
    // Prisma relation, matching this schema's convention) — looked up
    // separately so the admin UI can tell "approved but never provisioned
    // a Church row" apart from "approved and provisioned normally" (spec:
    // this gap is exactly how a merchant could get approved in Finix and
    // never appear in the Merchants Directory — 2026-08-15 admin bug
    // report).
    const churches = await prisma.church.findMany({
      where: { onboardingApplicationId: { in: applications.map((a) => a.id) } },
      select: { id: true, onboardingApplicationId: true },
    });
    const churchByAppId = new Map(churches.map((c) => [c.onboardingApplicationId, c.id]));

    const applicationsWithChurch = applications.map((a) => ({
      ...a,
      churchId: churchByAppId.get(a.id) ?? null,
    }));

    return NextResponse.json({ success: true, applications: applicationsWithChurch });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
