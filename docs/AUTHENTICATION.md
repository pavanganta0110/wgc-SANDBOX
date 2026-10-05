# Authentication

> No third-party auth provider (no NextAuth/Clerk/Auth0/Supabase Auth). Sessions are custom, HMAC-signed cookies. Source: `src/middleware.ts`, `src/lib/auth/session.ts`, `src/lib/auth/requireMerchantSession.ts`, `src/lib/auth/roles.ts`, `src/lib/auth/permissions.ts`, `src/lib/auth/impersonation.ts`, `src/lib/auth/viewScope.ts`.

## Session mechanism

A signed cookie, format `base64url(payload).base64url(signature)`, HMAC-SHA256 over the JSON payload, keyed by `AUTH_SESSION_SECRET`. No JWT library — hand-rolled, matching this codebase's general preference for no unnecessary dependencies (see `src/lib/auth/session.ts`'s own comment).

**Payload (`SessionPayload`):**
```ts
{
  userId: string;
  email: string;
  role: "wgc_super_admin" | "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";
  churchId: string | null;
  authVersion?: number;       // must match User.authVersion at check time — invalidates all sessions on bump
  passwordChangedAt?: number | null; // admin-session-only invalidation signal
  exp: number;                // unix seconds
  authTime?: number;
}
```

There are **two separate cookie-gated auth domains** that share this same token shape but are checked independently:

### 1. Admin auth (`/admin/**`, `/api/admin/**`)
- Roles: `wgc_admin`, `wgc_super_admin`.
- `getAdminSession()` (server-only, DB-backed) re-verifies `passwordChangedAt` against the live `User` row — any password reset invalidates every previously-issued admin token immediately, not just on next natural expiry.
- `src/middleware.ts` does a **fast, stateless, Edge-runtime** first-pass check (`verifyAdminSessionCookie`) using Web Crypto (not Node's `crypto`, since Edge middleware has no Node built-ins) — this only verifies the HMAC signature and `exp`/`role`, it does **not** hit the database. The full DB-backed check (disabled account, password-changed-since-issued) happens at the page/route level via `getAdminSession()`. **A route relying only on middleware's pass-through is not fully authenticated** — every admin route must still call `getAdminSession()` itself.
- Public admin paths (reachable without a session): `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/accept-invite`, and their supporting API routes (`/api/admin/login`, `/api/admin/forgot-password`, `/api/admin/setup/seed-admin` — the last is a one-time sandbox admin bootstrap with its own independent secret-header gate, since no session can exist for the very first admin).

### 2. Merchant/organization auth (`/merchant/**`, `/api/merchant/**`)
- Roles: `owner`, `admin`, `fundraiser`, `viewer` (plus legacy `church_admin`, normalized to `admin`-equivalent by `normalizeMerchantRole()`).
- `requireMerchantSession()` (server-only) is the **only** correct way to resolve `churchId` for a merchant-facing request — never trust one from a request body/query param. It:
  1. Verifies the session cookie (signature + expiry).
  2. Re-checks `authVersion` against the live `User` row (any forced-logout/role-change bumps this).
  3. Resolves `MerchantAuthContext` — `{ userId, email, churchId, rawRole, role, isWgcAdmin, permissionsJson, orgAccessState, impersonation? }`.
  4. Checks the **organization access gate** (see below) unless the caller explicitly opts out (`allowRestrictedAccess: true`) for the few pages that must remain reachable even when billing-restricted (billing setup itself, support, account info, logout).
- `src/middleware.ts` does a coarse **cookie-presence-only** check for `/merchant/**`/`/api/merchant/**` (redirects to login / returns 401 if no cookie at all) — this is a backstop, not a substitute for `requireMerchantSession()`, which every sensitive route must still call itself.
- Public merchant paths: `/merchant/login`, `/merchant/forgot-password`, `/merchant/set-password`, and their API equivalents (`/api/merchant/login`, `/logout`, `/forgot-password`, `/set-password`, `/validate-reset-token`).

**Important:** `wgc_admin`/`wgc_super_admin` are deliberately **excluded** from `NormalizedOrgRole` — code that normalizes a merchant-side role must check `isWgcAdmin` separately and must never let an internal WGC role silently fall through and be treated as an organization `owner`.

## Password reset / login / signup flows

- **Merchant login**: `POST /api/merchant/login` — email/password against `User.passwordHash` (`hashPassword`/`verifyPassword` in `src/lib/auth/password.ts`), issues the session cookie on success.
- **Merchant set-password** (first-time / invite acceptance): a merchant `User` is provisioned with `setPasswordTokenHash`/`setPasswordTokenExpiresAt` (see `provisionChurchAccount.ts`) rather than a password, and the donor-facing "dashboard access" email links to `/merchant/set-password/[token]`.
- **Forgot password**: `POST /api/merchant/forgot-password` / `validate-reset-token` — standard token-based reset, independent of the set-password-invite flow above.
- **Admin login/reset**: mirrors the merchant flow at `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/accept-invite`.

## Permissions

Two layers, resolved together by `resolveEffectivePermissions()` (`src/lib/auth/permissions.ts`):
1. **Base role matrix** — `ROLE_PERMISSIONS` (org roles: owner/admin/fundraiser/viewer) or `WGC_ADMIN_PERMISSIONS` (WGC-internal), keyed by `NormalizedOrgRole`/admin-ness.
2. **Per-user override** — `User.permissionsJson`, restricted to `OVERRIDABLE_PERMISSION_KEYS` only. Structural/high-risk permissions (`canManageOrgSettings`, `canManageRolesAndPermissions`, `canTransferOwnership`) can **never** come from an override — only from the base role — by design.

An impersonating admin (see below) resolves to the **real `owner` permission set**, not the narrower `WGC_ADMIN_PERMISSIONS` — this is a deliberate choice so "View as Merchant" shows exactly what the merchant sees, including write access.

## Organization access gate

`resolveOrgAccessState()` (`src/lib/billing/accessGate.ts`) computes one of: `NO_GATE`, `TRIALING_OR_ACTIVE`, `APPROVED_BILLING_REQUIRED`, `PAST_DUE_IN_GRACE`, `PAST_DUE_EXPIRED`, `CANCELED`, `SUSPENDED` — based on `Church.billingSetupStatus`/`billingAccessRestrictedAt` and the associated `WgcSubscription`. `requireMerchantSession()` enforces this on every call unless the caller passes `allowRestrictedAccess: true`. This is **completely independent** of whether the church's own donors can be charged — it only gates the church's *own* access to its WGC dashboard.

## Admin impersonation ("View as Merchant")

`src/lib/auth/impersonation.ts`, `src/app/api/admin/merchants/[churchId]/impersonate/route.ts`, `src/app/api/admin/impersonate/exit/route.ts`.

- A **separate** signed, HttpOnly cookie (`wgc_impersonation`, distinct from the admin's own `wgc_session` cookie — the admin is never logged out of their own identity) carries `{ impersonationSessionId, adminUserId, targetChurchId, exp }`.
- `AdminImpersonationSession` (DB table) is the source of truth — every request re-verifies the cookie against a **live** DB row, so a revoked/expired/ended session (or a since-disabled target church) fails closed on the very next request, not just at cookie-expiry time.
- `requireMerchantSession()` itself checks for a valid impersonation cookie **before** its normal admin-rejection path; when valid, it returns a `MerchantAuthContext` scoped to the **target** church with `role: "owner"`, `isWgcAdmin: true`, and `impersonation: { adminUserId, ... }` set — every existing merchant route needs zero changes to support this.
- Starting impersonation requires `wgc_super_admin` specifically.
- Every mutating write during impersonation should be tagged via `auditImpersonatedWrite()` (`src/lib/auth/auditImpersonatedWrite.ts`) into `DashboardAuditLog`, attributing the action to the admin, not the merchant.
- **Tenant-isolation invariant**: the only path to a `targetChurchId` is the DB-backed `AdminImpersonationSession` row, itself only ever created by the start route reading the URL path param server-side at start time — the resolver never reads `churchId` from a URL/body param at request time.

## "View as teammate" (same-tenant, not impersonation)

`src/lib/auth/viewScope.ts` — a **same-organization** "view as a specific teammate" tool (`wgc_view_scope` cookie), used e.g. by an `owner` wanting to see the dashboard as a `viewer` would. This is a *different* mechanism from admin impersonation: it has a hard rejection for any cross-organization attempt (it can only ever view within the same `churchId`), and is not reusable for the cross-tenant admin case — the two mechanisms are intentionally separate. `requireFullOrganizationContext()` is the escape hatch for pages that must always show the real user's own full context regardless of an active view-scope.

## Security considerations and known limitations

- Session secret (`AUTH_SESSION_SECRET`) must be ≥32 characters in production — enforced by a runtime throw in `getSecret()`.
- Edge middleware's admin check is **signature-and-expiry only** — it cannot see `authVersion`/`passwordChangedAt` invalidation. Any route that skips its own `getAdminSession()`/`requireMerchantSession()` call in favor of trusting middleware alone would accept a session that should have been invalidated (e.g. after a password reset or explicit logout-all).
- There is no rate-limiting library in use for login attempts beyond custom, purpose-built modules: `src/lib/auth/adminAuthRateLimit.ts` and `src/lib/auth/merchantAuthRateLimit.ts`.
- `BackgroundJob.entityId`/`FinixWebhookEvent` processing has no auth concept of its own — the worker route (`POST /api/internal/jobs/run`) is gated by a **separate** shared secret (`requireWorkerAuth()`), not a user session, and must remain fail-closed (missing/invalid secret = deny, never a public bypass).
