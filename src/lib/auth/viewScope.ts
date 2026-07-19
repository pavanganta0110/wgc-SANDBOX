import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "./requireMerchantSession";
import { hasPermission } from "./permissions";
import { ForbiddenError } from "./errors";
import { logDashboardAction } from "@/lib/dashboardAudit";

export const VIEW_SCOPE_COOKIE_NAME = "wgc_view_scope";
const VIEW_SCOPE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours — deliberately short-lived; "view as" is a working-session tool, not a persistent identity switch

export type ViewScope =
  | { kind: "organization" }
  | { kind: "currentUser" }
  | { kind: "user"; userId: string };

interface ViewScopePayload {
  scope: ViewScope;
  /** The real (never impersonated) userId that set this cookie — re-checked
   * against the current session on every read so one user's view-scope
   * cookie can never be replayed under a different logged-in identity. */
  setByUserId: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set — required to sign the view-scope cookie.");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: ViewScopePayload): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(signature)}`;
}

function verifyToken(token: string): ViewScopePayload | null {
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const actual = Buffer.from(signatureB64, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const payload: ViewScopePayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the view-scope cookie. Callers must have already verified the
 * requester has canViewAsUser and that the target user belongs to the same
 * church — this function does not re-derive those checks, it only signs and
 * stores the decision (see setViewScope's caller: the future view-scope API
 * route in the Team-management UI checkpoint).
 */
export async function setViewScope(scope: ViewScope, setByUserId: string): Promise<void> {
  const payload: ViewScopePayload = {
    scope,
    setByUserId,
    exp: Math.floor(Date.now() / 1000) + VIEW_SCOPE_MAX_AGE_SECONDS,
  };
  const cookieStore = await cookies();
  cookieStore.set(VIEW_SCOPE_COOKIE_NAME, signPayload(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VIEW_SCOPE_MAX_AGE_SECONDS,
  });
}

export async function clearViewScope(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_SCOPE_COOKIE_NAME);
}

export interface ResolvedViewScope {
  /** What reporting queries should be scoped to. Always "organization" for
   * anyone without canViewAsUser, regardless of what the cookie claims. */
  effective: ViewScope;
  /** True if the effective scope differs from "the requester viewing their
   * own identity" — i.e. an admin/owner is looking at another user's data.
   * requireFullOrganizationContext() uses this to block sensitive actions. */
  isViewingAsOther: boolean;
}

/**
 * Resolves the effective view scope for the current request. Memoized via
 * cache() — safe to call from every route/component that needs it without
 * adding extra queries beyond the first call.
 *
 * Re-validates on every request, even though the cookie is signed:
 * - the cookie was set by the currently authenticated user (not replayed
 *   across a session swap on the same browser)
 * - the requester currently has canViewAsUser (a permission revoked since
 *   the cookie was set immediately collapses the scope back to "organization")
 * - for a `user:{userId}` scope, the target user still exists and still
 *   belongs to the same church (disabled users remain viewable for
 *   historical reporting per the approved spec — deletion/cross-church
 *   moves are the only things that invalidate the scope)
 *
 * This function affects reporting scope ONLY. It must never be consulted by
 * any code path that selects a Finix merchant, settlement destination, bank
 * account, or organization ownership — those always use the real
 * authenticated identity from requireMerchantSession(), never this.
 */
/**
 * Best-effort cookie removal — cookies() can only be mutated inside a
 * Server Action or Route Handler; resolveViewScope() is also called during
 * plain page/RSC renders, where a set()/delete() call throws. Clearing here
 * is cleanup, not correctness (an unclearable invalid cookie keeps failing
 * verification and falling back safely on every future read regardless),
 * so a failure to clear is swallowed rather than surfaced.
 */
async function tryClearInvalidCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(VIEW_SCOPE_COOKIE_NAME);
  } catch {
    // Not in a context that allows cookie mutation (e.g. a Server Component
    // render) — safe to ignore, see comment above.
  }
}

/**
 * Records a safe, low-detail security event for a view-scope cookie that
 * was present but failed validation. Never called for the ordinary
 * no-cookie case (most users, every request) — only for a cookie that
 * existed and turned out to be invalid, tampered, expired, or no longer
 * authorized, which is the actually-interesting signal. Metadata is
 * deliberately just an enum reason code — never the raw token, signature,
 * or any other sensitive detail.
 */
async function logInvalidViewScope(auth: MerchantAuthContext, reason: string): Promise<void> {
  try {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "VIEW_SCOPE_REJECTED",
      entityType: "ViewScopeCookie",
      metadata: { reason },
    });
  } catch {
    // Audit logging must never break the request it's observing.
  }
}

export const resolveViewScope = cache(async (auth: MerchantAuthContext): Promise<ResolvedViewScope> => {
  // Team-access Checkpoint 4A fix: canViewAllTransactions and canViewAsUser
  // are separate permissions and must not be conflated.
  // - canViewAllTransactions decides whether this user's *normal* view is
  //   the whole organization (true for OWNER and base ADMIN) or just
  //   themselves (FUNDRAISER, VIEWER by default).
  // - canViewAsUser decides only whether they may explicitly select
  //   `user:{userId}` — a distinct, narrower capability (an ADMIN can have
  //   canViewAllTransactions without canViewAsUser: full org view, but
  //   cannot impersonate a specific teammate's scope).
  // Explicitly selecting "organization" via the cookie uses the same
  // canViewAllTransactions check as the default — it's just re-asserting
  // your own natural scope, not impersonation, so canViewAsUser is not the
  // right gate for it either.
  const canSeeOrganization = hasPermission(auth, "canViewAllTransactions");
  const fallback: ResolvedViewScope = canSeeOrganization
    ? { effective: { kind: "organization" }, isViewingAsOther: false }
    : { effective: { kind: "currentUser" }, isViewingAsOther: false };

  const cookieStore = await cookies();
  const token = cookieStore.get(VIEW_SCOPE_COOKIE_NAME)?.value;
  if (!token) return fallback; // normal state for most users — no event, nothing to clear

  const invalidate = async (reason: string): Promise<ResolvedViewScope> => {
    await Promise.all([tryClearInvalidCookie(), logInvalidViewScope(auth, reason)]);
    return fallback;
  };

  const payload = verifyToken(token);
  if (!payload) return invalidate("invalid_signature_or_expired");
  if (payload.setByUserId !== auth.userId) return invalidate("identity_mismatch");

  if (payload.scope.kind === "organization") {
    if (!canSeeOrganization) return invalidate("missing_can_view_all_transactions");
    return { effective: payload.scope, isViewingAsOther: false };
  }
  if (payload.scope.kind === "currentUser") {
    return { effective: payload.scope, isViewingAsOther: false };
  }

  // user:{userId} scope — this is the real "view as another person" capability.
  if (!hasPermission(auth, "canViewAsUser")) return invalidate("missing_can_view_as_user");

  const target = await prisma.user.findUnique({
    where: { id: payload.scope.userId },
    select: { id: true, churchId: true },
  });
  if (!target) return invalidate("target_user_deleted");
  if (target.churchId !== auth.churchId) return invalidate("cross_organization_target");

  const isSelf = target.id === auth.userId;
  return { effective: payload.scope, isViewingAsOther: !isSelf };
});

/**
 * Rejects sensitive actions while an admin/owner is viewing another user's
 * scope. Call this at the top of any route that changes: bank account,
 * billing, team roles/permissions, ownership transfer, or settlement
 * destination — per the approved spec, view-as is reporting-only.
 */
export async function requireFullOrganizationContext(auth: MerchantAuthContext): Promise<void> {
  const { isViewingAsOther } = await resolveViewScope(auth);
  if (isViewingAsOther) {
    throw new ForbiddenError(
      "This action isn't available while viewing another user's scope. Return to your own view to continue."
    );
  }
}
