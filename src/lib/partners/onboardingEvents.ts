import { prisma } from "@/lib/prisma";
import { recordPartnerEvent } from "./partnerWebhooks";
import { eventTypeForStage, onboardingStage, requestedItemsList, type OnboardingStage } from "./onboardingStages";

/**
 * Tells a partner that one of its applications moved to a new stage. Called from
 * the places that already change an application's status (the submit route and
 * the Finix webhook handler) after they have saved it. Never throws, and does
 * nothing for an application that has no partner.
 */
export async function notifyPartnerOfOnboardingStage(params: {
  applicationId: string;
  /** The stage before this change, if known. A repeat of the same stage is not announced again. */
  previousStage?: OnboardingStage | null;
  /** The one-time upload link, only known at the moment a request for information is created. */
  updateUrl?: string | null;
}): Promise<void> {
  try {
    const app = await prisma.onboardingApplication.findUnique({
      where: { id: params.applicationId },
      select: {
        id: true,
        partnerId: true,
        partnerReference: true,
        organizationName: true,
        legalBusinessName: true,
        status: true,
        onboardingStatus: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        updateRequestedItems: true,
        updateRequestedAt: true,
      },
    });
    if (!app?.partnerId) return;

    const stage = onboardingStage(app);
    if (params.previousStage === stage) return;
    const type = eventTypeForStage(stage);
    if (!type) return;

    const church = stage === "approved" ? await prisma.church.findFirst({ where: { onboardingApplicationId: app.id }, select: { id: true } }) : null;
    await recordPartnerEvent({
      partnerId: app.partnerId,
      type,
      onboardingApplicationId: app.id,
      data: {
        organization: { id: church?.id ?? null, name: app.legalBusinessName || app.organizationName, reference: app.partnerReference },
        applicationId: app.id,
        stage,
        submittedAt: app.submittedAt?.toISOString() ?? null,
        approvedAt: app.approvedAt?.toISOString() ?? null,
        rejectedAt: app.rejectedAt?.toISOString() ?? null,
        ...(stage === "information_required"
          ? { requestedItems: requestedItemsList(app.updateRequestedItems), requestedAt: app.updateRequestedAt?.toISOString() ?? null, updateUrl: params.updateUrl ?? null }
          : {}),
      },
    });
  } catch (err) {
    console.error(`notifyPartnerOfOnboardingStage failed for application=${params.applicationId}:`, err);
  }
}

/**
 * Tells a partner that an organization answered a request for more information (it
 * uploaded or filled in what was missing) and the application is back under review.
 * Sent once, from the route that saves the submission. Never throws.
 */
export async function notifyPartnerOfInformationSubmitted(applicationId: string): Promise<void> {
  try {
    const app = await prisma.onboardingApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, partnerId: true, partnerReference: true, organizationName: true, legalBusinessName: true, lastUpdateSubmittedAt: true },
    });
    if (!app?.partnerId) return;
    await recordPartnerEvent({
      partnerId: app.partnerId,
      type: "onboarding.information_submitted",
      onboardingApplicationId: app.id,
      data: {
        organization: { id: null, name: app.legalBusinessName || app.organizationName, reference: app.partnerReference },
        applicationId: app.id,
        stage: "under_review",
        submittedAt: app.lastUpdateSubmittedAt?.toISOString() ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error(`notifyPartnerOfInformationSubmitted failed for application=${applicationId}:`, err);
  }
}
