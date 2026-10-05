# Configuration

All configuration is via environment variables (no separate config-file system beyond `next.config.ts`, `vercel.json`, `tsconfig.json`). Loaded via Next.js's standard `.env.local` (dev) / Vercel project environment variables (deployed). **`NEXT_PUBLIC_*`** variables are inlined into the client bundle at build time; everything else is server-only.

> ⚠️ See [`README.md`](./README.md)'s hazard note: a bare command can silently resolve `DATABASE_URL` from `.env` (which may contain production-shaped values in this checkout) instead of `.env.local`, because Prisma's client lazily auto-loads `.env` whenever `DATABASE_URL` isn't already present in `process.env`. Always confirm which database a command targets first.

## Core / infrastructure

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (pooled) | Sandbox vs. production — see hazard note above |
| `DIRECT_URL` | Postgres connection string (direct, for `prisma db push`) | |
| `AUTH_SESSION_SECRET` | HMAC key signing all session cookies | Must be ≥32 chars in production (enforced at runtime) |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL, used to build absolute links in emails | Falls back to `https://www.wgcpayments.com` if unset |
| `NEXT_PUBLIC_SITE_URL` | Public marketing-site URL | |
| `CRON_SECRET` | Bearer token required by every `/api/cron/*` route in production; also reused by the background-job worker's `requireWorkerAuth()` | Fail-closed: missing in production = 500 + alert, not an open door |
| `SUPPORT_EMAIL` | Fallback "from"/reply-to and WGC-admin alert recipient | Defaults to `support@wgcpayments.com` |
| `EMAIL_FROM` | Resend "from" address | |
| `RESEND_API_KEY` | Email provider | Unset = emails are skipped with a console warning, not a crash |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project (hosts the Postgres DB; also used for some storage/service-role operations) | |

## Finix (payment processor)

| Variable | Purpose |
|---|---|
| `FINIX_USERNAME` / `FINIX_PASSWORD` | Basic Auth credentials for the Finix API |
| `FINIX_APPLICATION_ID` | WGC's Finix Application (platform) id |
| `FINIX_APPLICATION_OWNER_ID` | Finix application owner identity |
| `FINIX_BASE_URL` | Finix API base (sandbox vs. live host) |
| `FINIX_VERSION` | `FINIX-VERSION` header value required on every request |
| `FINIX_ENVIRONMENT` / `NEXT_PUBLIC_FINIX_ENV` | Environment label (sandbox/live) — client and server copies |
| `FINIX_PROCESSOR` | Named processor config, where applicable |
| `FINIX_WEBHOOK_SECRET` / `FINIX_WEBHOOK_SIGNING_KEY` | HMAC signature verification secret for inbound webhooks |
| `FINIX_WEBHOOK_BASIC_USERNAME`/`PASSWORD` (and `_AUTH_` variants) | Alternative/additional Basic Auth gate on the webhook endpoint |
| `FINIX_WEBHOOK_BEARER_TOKEN` | Alternative Bearer auth gate on the webhook endpoint |
| `NEXT_PUBLIC_FINIX_APPLICATION_ID` | Client-side Finix.js tokenization application id |
| `NEXT_PUBLIC_FINIX_DASHBOARD_LOGIN_URL` | Link to Finix's own merchant dashboard |
| `NEXT_PUBLIC_FINIX_PRIVACY_URL` / `NEXT_PUBLIC_FINIX_TERMS_URL` | Legal links surfaced during onboarding |
| `FINIX_SYNC_DEBUG` | Verbose logging toggle for the sync layer |
| `FINIX_SUBSCRIPTIONS_SYNC_ENABLED` | Feature flag for the subscription-sync path |
| `ALLOW_SETTLEMENT_BACKFILL` | Guards a manual settlement-backfill admin action |
| `FINIX_WGC_BILLING_MERCHANT_ID` / `FINIX_WGC_BILLING_IDENTITY_ID` | The Finix identifiers for WGC's *own* platform-billing merchant (separate from any client church's) |
| `WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID` / `WGC_ORGANIZATION_PAID_FEE_PROFILE_ID` | Finix fee-profile ids selected based on who covers the processing fee |

## Wallets (Apple Pay / Google Pay)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID` / `NEXT_PUBLIC_FINIX_APPLE_PAY_MERCHANT_IDENTIFIER` | Apple Pay merchant identifiers |
| `GOOGLE_PAY_MERCHANT_ID` / `NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID` | Google Pay merchant id |
| `GOOGLE_PAY_PRODUCTION_APPROVED` | Whether Google has approved production Google Pay use (gates test vs. production environment in the client) |
| `NEXT_PUBLIC_ENABLE_TEST_WALLET_ADAPTER` | Dev-only wallet test adapter toggle |

## Third-party integrations

| Variable | Purpose |
|---|---|
| `QUICKBOOKS_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` / `_SCOPES` / `_ENVIRONMENT` | QuickBooks Online OAuth |
| `QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY` | Encrypts stored QuickBooks OAuth tokens at rest |
| `QUICKBOOKS_INTEGRATION_ENABLED` / `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | Feature flag + webhook auth |
| `APLOS_API_BASE_URL` / `APLOS_CREDENTIAL_ENCRYPTION_KEY` / `APLOS_SYNC_ENABLED` | Aplos accounting integration |
| `PRINTFUL_ACCESS_TOKEN` / `_API_BASE_URL` / `_CLIENT_ID` / `_CLIENT_SECRET` / `_CREDENTIAL_ENCRYPTION_KEY` / `_MODE` / `_WEBHOOK_SECRET` / `_INTEGRATION_ENABLED` | Printful merchandise fulfillment |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (donor/merchant sign-in or integration, per call site) |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple OAuth |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM_NUMBER` | SMS (invoice reminders) |
| `INVOICE_SMS_REMINDERS_ENABLED` | Feature flag |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Onboarding-form bot protection |
| `NEXT_PUBLIC_META_PIXEL_ID` | Marketing pixel |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key (public, safe to expose client-side) — session replay, web analytics, product analytics. Initialized in `src/instrumentation-client.ts`; unset = posthog-js no-ops, no crash |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog ingestion host — `https://us.i.posthog.com` (US Cloud, default) or `https://eu.i.posthog.com` (EU Cloud) |

## Operational limits / feature flags

| Variable | Purpose |
|---|---|
| `WGC_BILLING_GRACE_PERIOD_DAYS` | Days a past-due WGC subscription stays in `PAST_DUE_IN_GRACE` before full restriction |
| `PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS` | Cap on concurrent bank-account change requests per church |
| `PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS` | Cap on retained historical payout-account records |
| `PAYOUT_PROOF_MAX_FILES` | Max files attachable as bank-account-change proof |

## Dev/sandbox-only

| Variable | Purpose |
|---|---|
| `ADMIN_SETUP_SECRET` | Gates the one-time `/api/admin/setup/seed-admin` bootstrap route |
| `SANDBOX_ADMIN_EMAIL` / `SANDBOX_ADMIN_PASSWORD` | Seed credentials for local/sandbox admin bootstrap |
| `TEST_WEBHOOK_SECRET` | Gates `/api/test/*` routes; if unset outside production, those routes are open (dev convenience — never rely on this in a shared environment) |

## How configuration is loaded

Standard Next.js env loading (`.env.local` in dev, Vercel project env vars when deployed) — there is no custom config-loading module; `process.env.X` is read directly at the point of use throughout `src/lib/**`. A few modules apply their own runtime validation/defaults (e.g. `AUTH_SESSION_SECRET`'s length check in `src/lib/auth/session.ts`, `RESEND_API_KEY`'s graceful no-op fallback in `src/lib/email.ts`) rather than a central schema-validated config object.

## Build/framework config files

| File | Purpose |
|---|---|
| `next.config.ts` | Next.js build config (large — covers image domains, headers, redirects, etc.; read directly for specifics) |
| `vercel.json` | Deployment region + all Cron job schedules — see [`API.md`](./API.md#cron-cron_secret-gated) |
| `tsconfig.json` | TypeScript compiler options + path aliases (`@/*` → `src/*`) |
| `eslint.config.mjs` | Lint rules |
| `vitest.config.ts` | Test runner config — `include: ["src/**/*.test.ts"]`, Node environment |
| `playwright.config.ts` | E2E config — single worker, serialized (`fullyParallel: false`) because spec files share one Postgres database |
| `prisma/schema.prisma` | Database schema — see [`DATA_MODELS.md`](./DATA_MODELS.md) |
