import { prisma } from "@/lib/prisma";
import { onboardingStage, requestedItemsList } from "./onboardingStages";

/**
 * What the partner's iframe shows for one of its organizations. Only ever called with a
 * partnerId and reference read from a verified embed link, and every lookup is scoped by
 * both, so one partner's frame can never show another partner's organization.
 */
export type PartnerEmbedState =
  | { kind: "form" }
  | { kind: "pending"; stage: "submitted" | "under_review"; organizationName: string }
  | { kind: "information_required"; organizationName: string; items: string[] }
  | { kind: "setting_up"; organizationName: string }
  | { kind: "ready"; churchId: string; organizationName: string }
  | { kind: "rejected"; organizationName: string }
  | { kind: "failed"; organizationName: string };

export async function loadPartnerEmbedState(partnerId: string, reference: string): Promise<PartnerEmbedState> {
  // An organization that exists is the one thing that decides "ready", whatever the application says.
  const church = await prisma.church.findFirst({
    where: { partnerId, partnerReference: reference },
    select: { id: true, name: true },
  });
  if (church) return { kind: "ready", churchId: church.id, organizationName: church.name };

  const app = await prisma.onboardingApplication.findFirst({
    where: { partnerId, partnerReference: reference },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      onboardingStatus: true,
      submittedAt: true,
      organizationName: true,
      legalBusinessName: true,
      updateRequestedItems: true,
    },
  });
  if (!app) return { kind: "form" };

  const organizationName = app.legalBusinessName || app.organizationName;
  const stage = onboardingStage(app);
  switch (stage) {
    case "draft":
      return { kind: "form" };
    case "submitted":
    case "under_review":
      return { kind: "pending", stage, organizationName };
    case "information_required":
      return { kind: "information_required", organizationName, items: requestedItemsList(app.updateRequestedItems) };
    case "approved":
      return { kind: "setting_up", organizationName };
    case "rejected":
      return { kind: "rejected", organizationName };
    case "failed":
      return { kind: "failed", organizationName };
  }
}
