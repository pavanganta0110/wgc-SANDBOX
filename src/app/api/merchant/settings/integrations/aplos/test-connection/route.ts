import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { testConnection, decryptStoredCredential, runAplosVerification } from "@/lib/integrations/aplos/connectionService";
import { CredentialValidationFailure, validateCredentialInput } from "@/lib/integrations/aplos/credentialValidation";
import { checkAplosConnectionRateLimit } from "@/lib/integrations/aplos/rateLimit";
import { APLOS_AUDIT_EVENTS, maskAplosAccountId } from "@/lib/integrations/aplos/auditEvents";
import { prisma } from "@/lib/prisma";

/**
 * Test Connection — the full real verification sequence (validate ->
 * encrypt-in-flight-only -> obtain+decrypt Aplos token -> real read-only
 * partners/verify call -> runtime-validate the response), per
 * connectionService.ts. Never marks a connection CONNECTED; see connect/
 * route.ts for that. Two modes:
 *   - Body includes clientId/privateKeyMaterial/aplosAccountId: tests those
 *     ephemeral credentials (the connection wizard, before ever connecting).
 *   - Empty body: re-tests the church's already-stored, already-verified
 *     credential (a "Test Connection" action on the connected-state page).
 *
 * churchId is always taken from the authenticated session, never from the
 * request body — a request cannot test or probe another organization's
 * connection.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    requirePermission(auth, "canManageIntegrations");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  if (!checkAplosConnectionRateLimit(auth.churchId)) {
    return NextResponse.json({ error: "Too many connection attempts. Please wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const hasSubmittedCredentials =
    body && typeof body === "object" && ("clientId" in body || "privateKeyMaterial" in body || "aplosAccountId" in body);

  let result;
  try {
    if (hasSubmittedCredentials) {
      result = await testConnection(auth.churchId, body);
    } else {
      const existing = await prisma.aplosConnection.findUnique({
        where: { churchId: auth.churchId },
        select: { status: true, clientId: true, aplosOrganizationId: true },
      });
      if (!existing || existing.status !== "CONNECTED" || !existing.aplosOrganizationId) {
        return NextResponse.json({ error: "No connected Aplos organization to test. Provide credentials to test a new connection." }, { status: 400 });
      }
      const credentials = await decryptStoredCredential(auth.churchId);
      const verifyResult = await runAplosVerification(
        validateCredentialInput({ ...credentials, aplosAccountId: existing.aplosOrganizationId })
      );
      await prisma.aplosConnection.update({
        where: { churchId: auth.churchId },
        data: verifyResult.success
          ? { lastConnectionTestAt: new Date() }
          : {
              lastConnectionTestAt: new Date(),
              lastErrorAt: new Date(),
              lastErrorCode: verifyResult.normalized.category,
              lastErrorMessage: verifyResult.normalized.safeMessage,
            },
      });
      result = verifyResult;
    }
  } catch (err) {
    if (err instanceof CredentialValidationFailure) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: APLOS_AUDIT_EVENTS.CONNECTION_TESTED,
    entityType: "AplosConnection",
    metadata: {
      success: result.success,
      ...(result.success
        ? { aplosAccountId: maskAplosAccountId(result.aplosAccountId) }
        : { errorCategory: result.normalized.category }),
      timestamp: new Date().toISOString(),
    },
    req,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.normalized.safeMessage, category: result.normalized.category }, { status: 200 });
  }

  return NextResponse.json({ success: true, aplosAccountId: result.aplosAccountId });
}
