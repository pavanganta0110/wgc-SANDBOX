import { prisma } from "@/lib/prisma";
import { sendWgcAdminEmail } from "@/lib/email";

export interface FinixTerminationDetails {
  reason?: string | null;
  description?: string | null;
  terminated_at?: string | null;
}

export interface HandleMerchantTerminationParams {
  church: { id: string; status: string } | null;
  onboardingApplication: {
    id: string;
    onboardingStatus: string | null;
    contactEmail: string;
    organizationName: string;
    legalBusinessName: string | null;
  } | null;
  finixMerchantId: string;
  terminationDetails: FinixTerminationDetails | null | undefined;
}

/**
 * Applies a Finix-reported merchant termination to WGC's own records —
 * shared by the live webhook handler and the admin "Resync from Finix"
 * backfill action, so there is exactly one place this logic lives. Safe
 * to call repeatedly: no-ops (and sends nothing) once the Church or
 * application is already marked TERMINATED, so a redelivered webhook or a
 * repeated manual resync never re-alerts WGC admin for the same event.
 */
export async function handleMerchantTermination(params: HandleMerchantTerminationParams): Promise<{ applied: boolean }> {
  const { church, onboardingApplication, finixMerchantId, terminationDetails } = params;

  const alreadyTerminated = church?.status === "TERMINATED" || onboardingApplication?.onboardingStatus === "TERMINATED";
  if (alreadyTerminated) return { applied: false };

  const terminationReason = terminationDetails?.description || terminationDetails?.reason || null;
  const terminatedAt = terminationDetails?.terminated_at ? new Date(terminationDetails.terminated_at) : new Date();

  if (church) {
    await prisma.church.update({
      where: { id: church.id },
      data: { status: "TERMINATED", terminatedAt, terminationReason },
    });
  }

  if (onboardingApplication) {
    await prisma.onboardingApplication.update({
      where: { id: onboardingApplication.id },
      data: { onboardingStatus: "TERMINATED", lastStatusChangedAt: new Date() },
    });

    const safeOrgName = onboardingApplication.legalBusinessName || onboardingApplication.organizationName || "your organization";
    await sendWgcAdminEmail({
      merchantName: safeOrgName,
      contactEmail: onboardingApplication.contactEmail,
      finixMerchantId,
      newStatus: "TERMINATED",
      whatHappened: `Finix terminated this merchant's account.${terminationReason ? ` Reason: ${terminationReason}` : ""}`,
      actionNeeded: "Confirm the organization's records reflect the closed account. No dashboard-access email is sent for a termination.",
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
      onboardingApplicationId: onboardingApplication.id,
    });
  }

  return { applied: true };
}
