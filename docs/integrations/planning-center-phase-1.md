# Planning Center — Phase 1: Connect / Disconnect

Status: BUILT (phase 1 code, tests and docs complete; not yet run against a real Planning Center account). Owner: TBD. Sources: Planning Center API docs
(authentication, rate limiting, webhooks, Giving `Donation`/`PaymentSource`),
read 2026-10-13. Re-verify against the docs before building — limits can change.

## Goal

A church admin on `/merchant/settings/integrations` can **Connect Planning
Center**, approve WGC on Planning Center's consent screen, and return to WGC
showing "Connected to <church name>". They can test the connection and
disconnect. Tokens are stored encrypted and refreshed automatically.

**Out of scope for phase 1** (later phases): People import, fund mapping,
creating the "WGC" payment source, pushing gifts, refunds, webhooks.
Phase 1 must not write anything to the church's Planning Center account.

## Prerequisites (outside the repo)

1. A WGC-owned Planning Center organization, with an Organization
   Administrator creating **one** OAuth application (confidential client).
   One app serves every church; churches never make their own.
2. Redirect URIs registered: production, plus a local/staging one.
3. Scopes requested: `giving people` (plus `openid` only if we later want
   the org name from the ID token — see Open questions).
4. Env vars (see Config below) set in each environment.

## Design: copy the QuickBooks pattern

QuickBooks is the closest existing OAuth integration. Mirror its file layout
so reviewers recognise it:

```
src/lib/integrations/planningcenter/
  config.ts        env reading + isPlanningCenterConfigured()
  encryption.ts    reuse generic AES-GCM helpers (see Open questions)
  credentials.ts   encrypt/decrypt token pair
  errors.ts        normalized errors, token-endpoint classification
  authProvider.ts  code exchange, refresh, token cache
  resourceClient.ts  fetch wrapper: User-Agent, rate-limit headers, 429
  service.ts       build authorize URL, complete/disconnect/test
  __tests__/
src/app/api/merchant/settings/integrations/planning-center/
  route.ts (GET status)  connect/  callback/  disconnect/  test/
src/app/merchant/(dashboard)/settings/integrations/planning-center/page.tsx
```

Then remove the "Planning Center" entry from `INTEGRATION_CATALOG`
(`src/lib/integrations/catalog.ts`) — per that file's own comment, a built
provider must not also appear as "Coming Soon". Add a live card on the
integrations page the way QuickBooks/Aplos have.

## Data model

New Prisma model, one active connection per church:

```prisma
model PlanningCenterConnection {
  id       String @id @default(cuid())
  churchId String @unique

  status String @default("NOT_CONNECTED")
  // NOT_CONNECTED | CONNECTED | REAUTHENTICATION_REQUIRED | ERROR | DISCONNECTED

  // Planning Center's own ids, captured at connect time
  pcoOrganizationId   String?
  pcoOrganizationName String?
  pcoConnectedUserId  String?   // the PCO user who authorized
  pcoConnectedUserName String?

  accessTokenEncrypted     String?
  refreshTokenEncrypted    String?
  encryptionKeyFingerprint String?
  tokenExpiresAt           DateTime?   // access token: 2h
  refreshTokenExpiresAt    DateTime?   // refresh honored ~90d from issue
  scopesJson               Json?

  // Result of the connect-time permission probe (see Verification)
  canReadPeople  Boolean?
  canReadGiving  Boolean?
  canWriteGiving Boolean?

  connectedByUserId    String?
  connectedAt          DateTime?
  disconnectedAt       DateTime?
  lastConnectionTestAt DateTime?
  lastErrorAt          DateTime?
  lastErrorCode        String?
  lastErrorMessage     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([refreshTokenExpiresAt])
}
```

Notes:
- `pcoOrganizationId` should be **unique among CONNECTED rows** (partial
  unique index in a hand-written migration): one PCO org must not be
  linked to two WGC churches, or one church's gifts could land in another's
  ledger in later phases. Decide behavior on conflict (see Open questions).
- Migration: this repo has no `prisma/migrations` dir at repo root — check
  how schema changes are applied here (`docs/README.md`, `package.json`
  scripts) before writing the migration.

## OAuth flow

Same as `quickbooks/connect` + `callback`, with these differences:

| Concern | QuickBooks | Planning Center |
|---|---|---|
| Authorize URL | from OIDC discovery | `https://api.planningcenteronline.com/oauth/authorize` |
| Token URL | from discovery, HTTP Basic | `https://api.planningcenteronline.com/oauth/token`, client id/secret in body |
| Extra callback param | `realmId` | none — identify org via `GET /people/v2/me` or `/current/v2/me` after exchange |
| PKCE | not used | **use it** (`S256`); store `code_verifier` in the same httpOnly state cookie |
| Access token life | ~1h | 2h |
| Refresh | rotating, ~100d | refresh token returned on refresh; ~90d from issue |

Connect route (`GET`):
1. `requireMerchantSession()` then `requirePermission(auth, "canManageIntegrations")`.
2. If `!isPlanningCenterConfigured()` return 400 "not configured".
3. Generate `state` and PKCE verifier/challenge; set httpOnly, `secure` in
   prod, `sameSite=lax`, 10-minute cookies holding state, verifier, and the
   session `churchId`. Never take `churchId` from the query string.
4. Redirect to authorize URL with `scope=giving people`, `response_type=code`,
   `code_challenge`, `code_challenge_method=S256`, `state`.

Callback route (`GET`):
1. Read and delete the cookies; verify `state` matches; handle `error=access_denied`.
2. `requireMerchantSession()`; require `auth.churchId === cookie churchId`.
3. Exchange the code (with `code_verifier`) for tokens.
4. **Verify before persisting**: call `/people/v2/me` (and the permission
   probes below) with the new token. Never store an unverified credential.
5. Upsert `PlanningCenterConnection` as CONNECTED; clear error fields;
   `logDashboardAction("planningcenter.connection_created")`.
6. Redirect to the settings page with `?connected=true` or `?error=...`.
   All failures redirect with a short message, never raw JSON.

## Verification and permission probe (connect-time)

The integration acts with the authorizing PCO user's permissions, so a
low-privilege user would succeed at OAuth and then fail later. At connect
time, make cheap read calls and record the results:

- `GET /people/v2/me` — identity and org name.
- `GET /giving/v2/organization` or `GET /giving/v2/payment_sources?per_page=1`
  — proves Giving read.
- Write ability can't be probed without writing, and phase 1 writes nothing.
  Record `canWriteGiving = null` and revisit in the phase that first writes
  (the first `POST /payment_sources` will reveal it).

If Giving read fails with 403, still connect but show a clear warning:
"The Planning Center user who connected doesn't have Giving access. Reconnect
with a finance administrator account." Do not mark CONNECTED silently.

## Token refresh — the part to get right

QuickBooks keeps an **in-memory** per-process cache and refreshes inline. That
is only safe because it is single-process correct. For Planning Center, treat
refresh as durable state:

- Refresh tokens may rotate. If two serverless instances refresh the same
  token concurrently, the loser can end up holding a spent token and the
  church is silently disconnected. Guard refresh with a DB-level
  compare-and-swap or advisory lock on the connection row: read the row,
  refresh, `UPDATE ... WHERE id = ? AND refreshTokenEncrypted = <old>`; if
  zero rows updated, re-read and use the winner's token.
- Persist the **new** refresh token on every refresh.
- On `invalid_grant` or revoked token, set status `REAUTHENTICATION_REQUIRED`,
  record `lastErrorCode/Message`, and surface a "Reconnect" button. No retry
  loop.
- Add a cron (`/api/cron/planning-center-token-refresh`, daily, `CRON_SECRET`
  bearer check, wrapped in `withJobRunTracking`, like `aplos-sync`) that
  refreshes any CONNECTED token whose `refreshTokenExpiresAt` is within ~14
  days. Without this, a church that is idle for 90 days loses the connection
  with no warning. Add to `vercel.json` only when ready to ship, as the Aplos
  cron comment explains.
- Email/notify the church admins when status becomes
  `REAUTHENTICATION_REQUIRED` (reuse `notifications.ts` patterns from Aplos).

## Resource client

Small and boring, but get these right now because every later phase uses it:

- Always send `User-Agent: WGC Payments (<contact url or email>)`. PCO may
  return 403 without one.
- JSON:API content type; base `https://api.planningcenteronline.com`.
- Read `X-PCO-API-Request-Rate-Limit/Period/Count`; slow down at ~80%.
  On 429 honor `Retry-After`.
- **Retry only idempotent requests (GET).** Never auto-retry POST/PATCH —
  PCO has no idempotency key, so a blind retry can create duplicate
  donations in later phases. Build this rule into the client as a
  parameter so it can't be forgotten.
- Request timeout (15s, like the QuickBooks token calls); no external HTTP
  inside a DB transaction.
- Classify errors into: auth (401/invalid_grant), permission (403), rate
  limit (429), transient (5xx/network), other. Same shape as `errors.ts`
  in QuickBooks.

## UI

Page at `/merchant/settings/integrations/planning-center`:

- States: not configured (env missing), not connected, connected, needs
  reconnect, error.
- Connected view: PCO organization name, connected-by, connected date,
  last tested, permission warning if Giving access is missing.
- Buttons: Connect / Reconnect, Test connection, Disconnect (with confirm).
- Gate the page and every API route on `canManageIntegrations`.
- Disconnect: call PCO `/oauth/revoke` best-effort (don't fail the
  disconnect if PCO is unreachable), then null the tokens, set
  DISCONNECTED, audit-log it. Do not delete any future sync history.

## Config

Add to `docs/CONFIGURATION.md`:

| Var | Purpose |
|---|---|
| `PLANNING_CENTER_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` | The single WGC OAuth app |
| `PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY` | Encrypts stored tokens at rest |
| `PLANNING_CENTER_INTEGRATION_ENABLED` | Kill switch |
| `PLANNING_CENTER_USER_AGENT` | Contact string for the User-Agent header (optional) |

Read lazily and fail closed at point of use (same as QuickBooks/Aplos config)
so `next build` never fails on unset vars. Normalize pasted values (strip
quotes/newlines) as `quickbooks/config.ts` does.

## Tests (vitest, next to the code)

- `authProvider`: code exchange success/failure; refresh persists the new
  refresh token; concurrent refresh produces one network call and no token
  loss (CAS path); `invalid_grant` -> REAUTHENTICATION_REQUIRED.
- `resourceClient`: sends User-Agent; honors Retry-After on GET; does **not**
  retry POST on 429/5xx; classifies errors.
- `encryption/credentials`: round trip; key-mismatch fingerprint error.
- Callback route: bad state, missing cookie, church mismatch, user denied,
  session expired — each redirects with the right message and writes nothing.
- Connect route: refuses without `canManageIntegrations`; never reads
  `churchId` from the request.
- Permission probe: 403 on Giving yields a connected-with-warning state.

## Rollout

1. Merge behind `PLANNING_CENTER_INTEGRATION_ENABLED=false` in production.
2. Test end to end against a Planning Center sandbox org (PCO's free tier has
   full API access and sample data).
3. Enable for one pilot church; watch `lastErrorCode` and the refresh cron.
4. Only then submit the listing on planningcenter.com/integrations.

## Open questions

1. **Encryption**: share `encryption.ts` helpers across integrations, or copy
   per provider like Aplos/QuickBooks? Sharing is cleaner but touches shipped
   code; copying matches precedent. Recommend copy for phase 1, refactor later.
2. **Two WGC churches, one PCO org**: block, or allow with a warning?
   Recommend block (unique constraint) and tell the admin to contact support.
3. **Org name source**: `/people/v2/me` vs the OIDC `openid` scope. Verify
   which reliably returns the organization name before building.
4. **Refresh-token rotation**: confirm from a real response whether PCO
   returns a new refresh token on every refresh (their example shows one).
   The design above assumes yes, which is the safe assumption.
5. **Generic `IntegrationConnection` model** already exists in the schema.
   The catalog comment says new providers should use it. QuickBooks/Aplos
   didn't. Check whether it can hold encrypted tokens and a permission probe
   before deciding to add a new table.

## Definition of done

- A church admin can connect, see status, test, and disconnect from the UI.
- Tokens encrypted at rest, never returned to the client, never logged.
- Expired access tokens refresh transparently; refresh is race-safe.
- A church that stops being able to refresh shows REAUTHENTICATION_REQUIRED
  and is notified.
- Nothing is written to Planning Center.
- Catalog entry removed; docs/CONFIGURATION.md updated; tests passing.

## As built — deviations from this plan

- **Schema**: applied by `prisma db push` (see `package.json` build script), so
  there is no migration file. `pcoOrganizationId` is a plain `@unique` column
  (Prisma can't express a partial unique index); it is nulled on disconnect so
  another church can later connect that Planning Center organization.
- **Catalog**: the "Planning Center" "Coming Soon" row is kept while
  `PLANNING_CENTER_INTEGRATION_ENABLED` is off and swapped for the live card
  when it is on. The flag defaults to **off**.
- **Encryption**: copied per provider (open question 1) — own env var and key.
- **Not done**: the admin email when a connection becomes
  `REAUTHENTICATION_REQUIRED` (status badge + reconnect button only), and the
  cron is not yet in `vercel.json` (same deliberate deferral as `aplos-sync`).
- **Unverified assumptions** (no real Planning Center account was used):
  `GET /people/v2` returns the Organization resource with a `name`;
  `/people/v2/me` carries `meta.parent` with the org id; the token endpoint
  accepts client credentials in a form body. Confirm against the sandbox org.
