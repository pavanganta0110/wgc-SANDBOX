# QuickBooks Online

## Status

Live and verified end-to-end against a real Intuit sandbox company: connect →
donate → automatic Customer + Payment sync, confirmed via a real donation.
The OAuth2 authorization-code exchange, refresh-token flow, and Accounting
API client are all real implementations — no mock mode exists (Intuit only
supports OAuth2, unlike Aplos/Printful). OAuth endpoints are resolved from
Intuit's own discovery document at runtime, not hardcoded. Everything is
driven by environment variables, so switching to real Production credentials
(QUICKBOOKS_ENVIRONMENT=production) needs no code change.

## What's needed from Intuit before this can be tested end-to-end

1. **An Intuit Developer account** — developer.intuit.com (free).
2. **An app registered in that account**, which gives you:
   - `QUICKBOOKS_CLIENT_ID`
   - `QUICKBOOKS_CLIENT_SECRET`
   - Separate keys exist for the app's **Development** (sandbox) and
     **Production** settings — use the Development keys first.
3. **A redirect URI registered on the app** — must exactly match
   `QUICKBOOKS_REDIRECT_URI` below (path is
   `/api/merchant/settings/integrations/quickbooks/callback`).
4. **A sandbox company** — Intuit auto-provisions one free test QBO company
   per developer account (Dashboard → Sandbox). Connect to that first;
   connecting to a real production company requires Intuit's app-review
   process once this is ready to go live.
5. **Scopes** — `com.intuit.quickbooks.accounting` is the only scope this
   integration requests (read/write customers, invoices, payments, items).

## Environment variables

```env
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=https://<host>/api/merchant/settings/integrations/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=sandbox   # sandbox | production
QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY=   # openssl rand -base64 32
QUICKBOOKS_SCOPES=com.intuit.quickbooks.accounting   # optional, this is the default
QUICKBOOKS_INTEGRATION_ENABLED=true    # optional kill switch, defaults true in this sandbox repo
```

Until `QUICKBOOKS_CLIENT_ID`/`QUICKBOOKS_CLIENT_SECRET` are set, the
merchant-facing connection card shows "not yet configured" and the Connect
button is disabled — nothing throws, nothing 500s.

## Where it lives

- `src/lib/integrations/quickbooks/config.ts` — lazy env reads, fail-closed
  only at point of use.
- `src/lib/integrations/quickbooks/encryption.ts` /
  `src/lib/integrations/quickbooks/credentials.ts` — AES-256-GCM token
  storage, isolated key from Aplos/Printful (own env var).
- `src/lib/integrations/quickbooks/authProvider.ts` — authorization-code
  exchange (`exchangeAuthorizationCode`), refresh flow
  (`refreshAccessToken`), and an in-memory per-process cache/single-flight
  wrapper (`OAuthQuickBooksAuthProvider`) so a token is never refreshed
  more than once concurrently for the same organization.
- `src/lib/integrations/quickbooks/resourceClient.ts` — thin wrapper over
  the QuickBooks Accounting REST API (`QuickBooksResourceClient`): company
  info, customer lookup/create, invoice create, payment create.
  **REQUIRES-LIVE-VERIFICATION** — field/endpoint shapes are built from
  Intuit's published API reference, not yet exercised against a real
  company.
- `src/lib/integrations/quickbooks/service.ts` — the only place that talks
  to Prisma's `QuickBooksConnection` table; every route goes through this.
- `src/app/api/merchant/settings/integrations/quickbooks/` — status
  (`GET`), `connect` (`GET`, redirects to Intuit), `callback` (`GET`,
  handles Intuit's redirect back), `disconnect` (`POST`), `test` (`POST`).
- `src/components/merchant/QuickBooksConnectionCard.tsx` +
  `src/app/merchant/(dashboard)/settings/integrations/quickbooks/page.tsx`
  — merchant-facing connect/disconnect/test UI, linked from the
  Integrations index page.

## Data model

`QuickBooksConnection` (one per organization) stores the encrypted
access/refresh token pair, `realmId` (Intuit's company/tenant id),
`companyName`, and status/error tracking fields — same shape family as
`PrintfulConnection`. `QuickBooksSyncRecord` exists for a future sync
engine (customer/invoice/payment push) but nothing writes to it yet; no
sync engine has been built, only the connection layer.

## How to test once credentials exist

1. Set the env vars above using your app's **Development** keys and a
   `QUICKBOOKS_REDIRECT_URI` pointing at your dev server
   (`http://localhost:3000/api/merchant/settings/integrations/quickbooks/callback`
   — note Intuit requires `https` for non-localhost redirect URIs).
2. From a merchant account, go to Settings → Integrations → QuickBooks
   Online → Connect QuickBooks.
3. Log into the sandbox company Intuit provisioned for your developer
   account when prompted.
4. You should land back on the integrations page with a "Connected to
   QuickBooks" toast and the company name shown.
5. Click Test Connection to re-verify at any time; Disconnect clears the
   stored tokens (never deletes `QuickBooksSyncRecord` history).

## Not built yet

- No sync engine (pushing donors/payments into QuickBooks as
  Customers/Invoices/Payments) — `QuickBooksResourceClient` has the create
  calls, but nothing in `service.ts` calls them yet. This was scoped as
  "connection layer first," matching how the Printful integration was
  built ahead of real credentials.
- No webhook handler — QuickBooks does support webhooks with HMAC
  signature verification (`intuit-signature` header), unlike Printful's
  documented gap here; not built since there's nothing yet pushing data
  *out* of WGC that QuickBooks would need to notify about changes to.
