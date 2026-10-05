import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { finixClient } from "@/lib/finix/client";
import { parseVerificationOutcomes } from "@/lib/finix/parseVerificationOutcomes";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Manual "Refresh from Finix" action — fetches the application's current
 * Finix Verification on demand and re-parses it into updateRequestedItems,
 * the same way the MERCHANT.UPDATED webhook does. Exists because that
 * webhook-side parsing only runs on a NEW webhook delivery: an application
 * already sitting in MORE_INFORMATION_REQUIRED from before the parsing fix
 * shipped has no new webhook coming, so its updateRequestedItems stays
 * null/stale forever unless something re-fetches it (2026-09-04 finding —
 * confirmed for a real application whose updateRequestedItems was still
 * null after the webhook fix deployed). This lets an admin pull the
 * current real state immediately, without waiting on Finix or a merchant
 * action, and reuses the exact same outcome-parsing helper the webhook
 * uses so the two can't drift again.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { applicationId } = await params;
  const app = await prisma.onboardingApplication.findUnique({ where: { id: applicationId } });
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  let verificationId = app.finixVerificationId;

  // Some applications' verification id was never persisted on the
  // OnboardingApplication row itself — fall back to reading it off the
  // live Merchant resource, same as the webhook handler's own data source.
  if (!verificationId && app.finixMerchantId) {
    try {
      const merchant = await finixClient.getMerchant(app.finixMerchantId);
      verificationId = typeof (merchant as { verification?: unknown })?.verification === "string" ? (merchant as { verification: string }).verification : null;
    } catch (err) {
      console.error(`Failed to fetch Finix merchant ${app.finixMerchantId} to resolve verification id:`, err);
    }
  }

  if (!verificationId) {
    return NextResponse.json({ error: "No Finix verification is on file for this application." }, { status: 400 });
  }

  let verificationPayload: unknown;
  try {
    verificationPayload = await finixClient.getVerification(verificationId);
  } catch (err) {
    console.error(`Failed to fetch Finix verification ${verificationId}:`, err);
    return NextResponse.json({ error: "Could not reach Finix to fetch the verification." }, { status: 502 });
  }

  const requestedItems = parseVerificationOutcomes(verificationPayload);

  await prisma.onboardingApplication.update({
    where: { id: app.id },
    data: {
      finixVerificationId: verificationId,
      updateRequestedItems: requestedItems ?? app.updateRequestedItems,
      updateRequestedCodes: redactFinixPayload(verificationPayload as object) as object,
    },
  });

  return NextResponse.json({
    success: true,
    requestedItems: requestedItems ?? app.updateRequestedItems ?? null,
    outcomesFound: requestedItems !== null,
  });
}
