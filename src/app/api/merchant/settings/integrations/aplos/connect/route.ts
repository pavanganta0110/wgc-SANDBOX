import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { connectOrganization } from "@/lib/integrations/aplos/connectionService";
import { CredentialValidationFailure } from "@/lib/integrations/aplos/credentialValidation";
import { checkAplosConnectionRateLimit } from "@/lib/integrations/aplos/rateLimit";
import { APLOS_AUDIT_EVENTS, maskAplosAccountId } from "@/lib/integrations/aplos/auditEvents";

const MAX_LABEL_LENGTH = 100;

/**
 * Connect (save a verified connection). Runs the identical real
 * verification sequence as /test-connection — RSA decryption succeeding is
 * never sufficient; see connectionService.ts. Only on success does this
 * encrypt and persist the credential, with status CONNECTED. On any
 * failure, no credential material is ever written — see
 * connectOrganization()'s doc comment for the exact persistence rule.
 *
 * The request body is JSON (never multipart/FormData) — the browser reads
 * the uploaded private-key file client-side via the File API and submits
 * its text content as a normal string field, so nothing here ever touches
 * disk. The request body is never logged.
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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Organization label is a merchant-chosen display name only — Aplos's
  // /partners/verify never returns one (see partners.ts) — never trust an
  // unbounded string into the database.
  const rawLabel = body && typeof body === "object" && "organizationLabel" in body ? (body as Record<string, unknown>).organizationLabel : null;
  const organizationLabel =
    typeof rawLabel === "string" && rawLabel.trim() !== "" ? rawLabel.trim().slice(0, MAX_LABEL_LENGTH) : null;

  let outcome;
  try {
    outcome = await connectOrganization(auth.churchId, body, organizationLabel);
  } catch (err) {
    if (err instanceof CredentialValidationFailure) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  const { result, connected } = outcome;

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: connected ? APLOS_AUDIT_EVENTS.CONNECTED : APLOS_AUDIT_EVENTS.CONNECTION_FAILED,
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

  return NextResponse.json({ success: true, aplosAccountId: result.aplosAccountId, status: "CONNECTED" });
}
