import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { finixClient } from "@/lib/finix/client";
import { handleMerchantTermination } from "@/lib/onboarding/handleMerchantTermination";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Manual backfill for the gap fixed in handleMerchantTermination.ts: any
 * Church whose Finix merchant was terminated BEFORE that fix shipped never
 * got its status corrected, since the terminating webhook already fired
 * and Finix won't resend it on its own. Fetches the merchant's current
 * live state directly from Finix (the source of truth) and applies the
 * same termination handling a fresh webhook would — safe to run on any
 * merchant at any time; a no-op when Finix doesn't report termination.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { churchId } = await params;
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  if (!church.finixMerchantId) return NextResponse.json({ error: "This merchant has no Finix Merchant ID on file." }, { status: 400 });

  let merchantData: { is_terminated?: boolean; termination_details?: { reason?: string | null; description?: string | null; terminated_at?: string | null } };
  try {
    merchantData = await finixClient.getMerchant(church.finixMerchantId);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch merchant from Finix: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 502 });
  }

  if (!merchantData?.is_terminated) {
    return NextResponse.json({ synced: true, applied: false, isTerminated: false, message: "Finix does not currently report this merchant as terminated." });
  }

  const onboardingApplication = church.onboardingApplicationId
    ? await prisma.onboardingApplication.findUnique({ where: { id: church.onboardingApplicationId } })
    : null;

  const result = await handleMerchantTermination({
    church: { id: church.id, status: church.status },
    onboardingApplication: onboardingApplication
      ? {
          id: onboardingApplication.id,
          onboardingStatus: onboardingApplication.onboardingStatus,
          contactEmail: onboardingApplication.contactEmail,
          organizationName: onboardingApplication.organizationName,
          legalBusinessName: onboardingApplication.legalBusinessName,
        }
      : null,
    finixMerchantId: church.finixMerchantId,
    terminationDetails: merchantData.termination_details ?? null,
  });

  await logDashboardAction({
    churchId: church.id,
    actorEmail: session.email,
    actorRole: session.role,
    action: "admin.resynced_termination_from_finix",
    entityType: "Church",
    entityId: church.id,
    metadata: { applied: result.applied },
    req: _req,
  });

  return NextResponse.json({ synced: true, applied: result.applied, isTerminated: true });
}
