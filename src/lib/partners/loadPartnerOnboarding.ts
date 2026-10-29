import { prisma } from "@/lib/prisma";
import { onboardingStage, requestedItemsList, STAGE_LABELS, type OnboardingStage } from "./onboardingStages";

export interface PartnerOnboardingRow {
  id: string;
  organizationName: string;
  /** The partner's own id for the organization (a CRM location id). */
  reference: string | null;
  stage: OnboardingStage;
  stageLabel: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  /** Only while information is required. */
  requestedItems: string[];
  requestedAt: string | null;
  createdAt: string;
}

/**
 * The applications that came through one partner, newest first. `partnerId` must come
 * from the signed-in partner or the authenticated partner key: it is the only thing that
 * scopes this. Never returns an upload link (those are one-time and shown only when created).
 */
export async function loadPartnerOnboarding(partnerId: string, limit = 200): Promise<PartnerOnboardingRow[]> {
  const apps = await prisma.onboardingApplication.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      organizationName: true,
      legalBusinessName: true,
      partnerReference: true,
      status: true,
      onboardingStatus: true,
      submittedAt: true,
      approvedAt: true,
      rejectedAt: true,
      updateRequestedItems: true,
      updateRequestedAt: true,
      createdAt: true,
    },
  });

  return apps.map((a) => {
    const stage = onboardingStage(a);
    return {
      id: a.id,
      organizationName: a.legalBusinessName || a.organizationName,
      reference: a.partnerReference,
      stage,
      stageLabel: STAGE_LABELS[stage],
      submittedAt: a.submittedAt?.toISOString() ?? null,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      rejectedAt: a.rejectedAt?.toISOString() ?? null,
      requestedItems: stage === "information_required" ? requestedItemsList(a.updateRequestedItems) : [],
      requestedAt: stage === "information_required" ? (a.updateRequestedAt?.toISOString() ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    };
  });
}
