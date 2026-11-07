import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { finixClient } from "@/lib/finix/client";
import { handleMerchantTermination } from "@/lib/onboarding/handleMerchantTermination";
import { logDashboardAction } from "@/lib/dashboardAudit";
import {
  TERMINATION_CONFIRM_WORD,
  MAX_TERMINATION_DESCRIPTION,
  confirmationMatches,
  isTerminationReason,
} from "@/lib/onboarding/terminationConfirmation";

type FinixMerchant = {
  is_terminated?: boolean;
  onboarding_state?: string;
  termination_details?: { reason?: string | null; description?: string | null; terminated_at?: string | null };
};

/**
 * Permanently terminates a merchant at the processor, then applies the same
 * local termination handling the webhook does (status, billing stop, admin
 * alert). IRREVERSIBLE, so it is gated by: a super-admin session that
 * completed MFA this session, plus a typed confirmation the SERVER verifies
 * (the org's exact name AND the word TERMINATE), a reason, and a
 * description. Local state is only changed once Finix itself reports the
 * merchant terminated — never on our say-so.
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (session.role !== "wgc_super_admin") {
    return NextResponse.json({ error: "Only a super admin can terminate a merchant." }, { status: 403 });
  }

  const { churchId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  if (!church.finixMerchantId) return NextResponse.json({ error: "This merchant has no Finix Merchant ID on file." }, { status: 400 });
  if (church.status === "TERMINATED") return NextResponse.json({ error: "This merchant is already terminated." }, { status: 409 });

  if (!confirmationMatches(body?.confirmName, church.name)) {
    return NextResponse.json({ error: "Type the organization's exact name to confirm." }, { status: 400 });
  }
  if (body?.confirmWord !== TERMINATION_CONFIRM_WORD) {
    return NextResponse.json({ error: `Type ${TERMINATION_CONFIRM_WORD} to confirm.` }, { status: 400 });
  }
  if (!isTerminationReason(body?.reason)) {
    return NextResponse.json({ error: "Choose a termination reason." }, { status: 400 });
  }
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 10) {
    return NextResponse.json({ error: "Add a description of at least 10 characters." }, { status: 400 });
  }
  if (description.length > MAX_TERMINATION_DESCRIPTION) {
    return NextResponse.json({ error: `Description must be ${MAX_TERMINATION_DESCRIPTION} characters or fewer.` }, { status: 400 });
  }
  const reason = body.reason;

  const audit = (action: string, metadata: Record<string, unknown>) =>
    logDashboardAction({
      churchId: church.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action,
      entityType: "Church",
      entityId: church.id,
      metadata,
      req,
    }).catch((e) => console.error("[admin terminate] audit log failed:", e));

  // External HTTP happens before any DB write and outside any transaction.
  let after: FinixMerchant;
  try {
    // Finix only accepts the is_terminated flag on write (sending
    // termination_details.reason is rejected as an invalid field), so our
    // reason/description are recorded locally and in the audit log instead.
    await finixClient.updateMerchant(church.finixMerchantId, { is_terminated: true });
    after = await finixClient.getMerchant(church.finixMerchantId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await audit("admin.terminate_merchant_failed", { reason, error: message });
    return NextResponse.json({ error: `Finix did not terminate the merchant: ${message}` }, { status: 502 });
  }

  if (!after?.is_terminated) {
    await audit("admin.terminate_merchant_failed", { reason, error: "Finix did not report is_terminated after the update" });
    return NextResponse.json(
      { error: "Finix accepted the request but does not report the merchant as terminated. Nothing was changed here. Check the merchant in Finix." },
      { status: 502 },
    );
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
    terminationDetails: {
      reason: after.termination_details?.reason ?? reason,
      description: after.termination_details?.description || `${reason}: ${description}`,
      terminated_at: after.termination_details?.terminated_at ?? null,
    },
  });

  await audit("admin.terminated_merchant", { reason, description, applied: result.applied });

  return NextResponse.json({ terminated: true, applied: result.applied });
}
