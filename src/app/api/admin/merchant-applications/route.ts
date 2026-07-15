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

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
