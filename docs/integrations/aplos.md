# Aplos Integration

**Status: Checkpoint 2 of 10 — schema, encryption, and authentication foundation only.**
No contribution posting, no live Aplos calls, no production data touched. This document is
updated at the end of every checkpoint; see the bottom of this file for what's built so far.

This is **not** an official Aplos partner integration. Each WGC organization connects its own
Aplos account using credentials its own Aplos administrator generates (a client ID and private
key). WGC never uses a single shared Aplos account across merchants, and credentials are never
stored as Vercel environment variables — they live encrypted, per-organization, in the database.

Sync direction for this phase is one-way: **WGC → Aplos**. Aplos never writes back to WGC.

---

## 1. Architecture

```
Finix settlement becomes SETTLED (existing webhook, unchanged)
        │
        ▼
/api/cron/aplos-sync (new, own schedule — not the existing /api/cron/reconcile)
        │
        ▼
For each Church with AplosConnection.automaticSyncEnabled = true:
  find SETTLED FinixSettlements with no AplosSyncRecord yet, or one due for retry
        │
        ▼
AplosSettlementSyncService.processSettlement(settlementId)   [not yet built — Checkpoint 6]
  1. Upsert AplosSyncRecord (unique constraint prevents duplicates)
  2. Run mapping/balance/configuration checks -> BLOCKED with a reason if any fail
  3. Lock: PENDING/RETRY_SCHEDULED -> PROCESSING (conditional update)
  4. AplosContributionBuilder builds the payload from persisted cents fields
  5. AplosApiClient posts to Aplos, using AplosAuthenticationProvider for the token
  6. Store aplosContributionId, mark SYNCED, write DashboardAuditLog + notification
```

**Authorization is separated from the sync engine.** `AplosAuthenticationProvider` is an
interface (`src/lib/integrations/aplos/authProvider.ts`); `ManualCredentialAuthProvider` is the
only implementation today. A future official-partner OAuth flow implements the same interface —
`getAccessToken(churchId)` / `invalidate(churchId)` — and can be swapped in without touching the
contribution builder, mapping service, sync service, retry logic, or any UI.

## 2. Authentication (implemented exactly per Aplos's official documentation)

Source: `help.aplos.com`, "Aplos Open API" section, fetched directly during Checkpoint 2. Nothing
below is guessed.

- **Auth URL:** `GET https://app.aplos.com/hermes/api/v1/auth/:clientId` — no parameters.
- **Response:**
  ```json
  { "version": "v2_0_0", "status": 200, "data": { "expires": "2015-12-31T23:59:59.000-0700", "token": "<base64>" } }
  ```
- **Token encryption:** the `token` field is RSA/PKCS1Padding-encrypted with the organization's
  Aplos-generated public key. Decrypt with the matching private key: `RSA/ECB/PKCS1Padding`
  (Node: `crypto.privateDecrypt` with `RSA_PKCS1_PADDING`).
- **Expiration:** 30 minutes, exact timestamp given in `data.expires` — never assumed.
- **Refresh:** request a new token the same way (same URL) whenever the current one expires.
  Aplos's own guidance: requesting more than once per 30 minutes risks the client being flagged
  for abuse.
- **API calls** send `Authorization: Bearer <decrypted token>`, plus an optional
  `aplos-account-id` header identifying which Aplos organization to act on (used once an
  organization is selected — see Open Items).
- **Organization/account verification:** `GET /partners/verify?api-client-id=<id>` with
  `Authorization: Bearer <token>` — returns `{ authorized: true|false }`.

### A confirmed, important operational detail

Decrypting an access token with the **wrong** private key does not reliably throw. Modern
OpenSSL uses "implicit rejection" for RSA-PKCS1 decryption (a Bleichenbacher-attack
countermeasure) — a wrong key can silently produce garbage bytes instead of an error. This is
proven by `__tests__/authProvider.test.ts` against real RSA keypairs, not assumed.

**Consequence:** decrypt succeeding is not proof a submitted private key is correct.

**Binding requirement for Checkpoint 3's "Test Connection":** a connection may be saved as
`CONNECTED` only after all of the following succeed, in order — never on decrypt success alone:

1. Obtain and decrypt an Aplos access token.
2. Make one real, authenticated, **read-only** Aplos API request (e.g. `GET /partners/verify`).
3. Confirm access to the specific selected Aplos organization/account (not just "some" token
   worked).
4. Retrieve one safe resource (organization details, purposes, or accounts) to confirm the
   response actually corresponds to the expected organization.
5. Save only safe status metadata (`status`, `lastConnectionTestAt`, `aplosOrganizationId/Name`,
   fingerprints) — never the token, never any raw response body.

Without pilot credentials, Checkpoint 3 must build this flow, test it fully against mocked Aplos
responses, and mark real-Aplos verification as externally blocked — never fabricate a successful
connection result to make the flow appear complete.

## 3. Security model

### Private key encryption

`src/lib/integrations/aplos/encryption.ts` — AES-256-GCM via Node's built-in `crypto`. No
reversible-encryption utility existed anywhere in this codebase before this checkpoint (confirmed
during the Checkpoint 1 audit); the only prior precedent, `src/lib/auth/password.ts`, is one-way
hashing and cannot be reused here since Aplos requires the plaintext key back to authenticate.

**Storage envelope** (versioned, JSON, stored in `AplosConnection.encryptedPrivateKey` as a plain
`String` column, matching this schema's existing convention for opaque blobs):

```json
{ "version": "v1", "iv": "<base64>", "authTag": "<base64>", "ciphertext": "<base64>" }
```

- `version` allows a future algorithm change without breaking existing rows.
- `iv` is a fresh random 12 bytes per encryption — the same plaintext never produces the same
  ciphertext twice.
- `authTag` is GCM's authentication tag — any tampering with the ciphertext is detected and
  decryption fails loudly (verified in `__tests__/encryption.test.ts`).

**Key requirement:** `APLOS_CREDENTIAL_ENCRYPTION_KEY` — base64-encoded, must decode to exactly
32 bytes. Generate with:

```bash
openssl rand -base64 32
```

Validated lazily (on first real encrypt/decrypt call, not at module import — so `next build`,
typechecking, or any code path that never touches Aplos credentials is never broken just because
the var isn't set there) via `assertEncryptionKeyConfigured()`. **Use a different key for sandbox
and production** — never share one across environments.

**Fingerprinting, not the key itself:**

- `AplosConnection.privateKeyFingerprint` — `SHA-256(plaintext private key)`, hex, 16 chars. Lets
  a merchant confirm which key is connected ("...a1b2c3d4") without ever seeing it again.
- `AplosConnection.encryptionKeyFingerprint` — `SHA-256(active APLOS_CREDENTIAL_ENCRYPTION_KEY
  bytes)`, hex, 16 chars. Detects a key-rotation mismatch on decrypt (`credentials.ts` throws a
  specific `AplosCredentialKeyMismatchError` in that case, rather than a generic
  "corrupted or wrong key" message).

**Never:** logged, returned in any API response, written to email, stored in browser storage, or
placed in a `NEXT_PUBLIC_*` variable. Verified by grep across every new file as part of this
checkpoint's secret scan (see the Checkpoint 2 report).

### Permissions

New shared permission key: `canManageIntegrations` (`src/lib/auth/roles.ts`,
`src/lib/auth/permissions.ts`). Base role defaults:

| Role | `canManageIntegrations` |
|---|---|
| Owner | `true` |
| Admin | `true` |
| Fundraiser | `false` (overridable) |
| Viewer | `false` (overridable) |
| `wgc_admin` | always `false` — gated by middleware role-check instead, never this key |

Overridable per-user via `permissionsJson`, same mechanism as every other permission in this
codebase — added to `OVERRIDABLE_PERMISSION_KEYS`. Read-only integration status (once built) is
not gated by this key; every authenticated org member can view connection health, and only
state-changing actions (connect, disconnect, map, configure, enable sync, retry) require it.

## 4. Database models

Five new models, all additive (no existing model's columns were changed), plus one back-relation
on `Church` (`aplosConnection AplosConnection?`). Full field list and every constraint is in
`prisma/schema.prisma` — search for "Aplos Integration (feature/aplos-integration, Checkpoint 2)".

- **`AplosConnection`** — one per church (`@@unique` on `churchId`). Holds the encrypted
  credential, connection status, and `automaticSyncEnabled`.
- **`AplosPurposeMapping`** — WGC Fund → Aplos Purpose, `@@unique([churchId, wgcFundId])`.
- **`AplosAccountConfiguration`** — one per church, the merchant-selected deposit account,
  processing-fee expense account, and default purpose.
- **`AplosSyncRecord`** — the durable sync + idempotency record. **The financially critical
  constraint:** `@@unique([churchId, settlementId, syncVersion])` makes it structurally
  impossible — enforced by the database, not just application logic — for one settlement to be
  synced twice under the same sync generation.
- **`AplosSyncAttempt`** — one row per attempt against Aplos, for audit/diagnosis. Never stores a
  token, private key, Authorization header, or any payment credential.

No Prisma enums are used anywhere in this schema (confirmed zero `enum` declarations during the
audit) — every state field is a documented `String`, matching that existing convention exactly.

## 5. Financial field mapping (confirmed, per the approved Checkpoint 2 decisions)

| Concept | WGC field (source of truth) |
|---|---|
| WGC/application fee | `FinixTransfer.applicationFeeCents` — **not** derived from current pricing or `percentageBps`/`fixedFeeCents` |
| Processor fee | `Payment.actualFinixFeesCents` — **can be `null`** if Finix's async fee sync hasn't landed yet |
| Donation amount | `Payment.donationAmountCents` |
| Donor-covered fee | `Payment.feeCoveredCents` |
| Total charged | `Payment.amountCents` |
| Net settlement | `FinixSettlement.netAmountCents` |

**Not yet finalized:** which of `donationAmountCents` or `amountCents` (or a combination) Aplos
should treat as the charitable contribution amount. This depends on auditing WGC's existing
receipt/statement treatment of donor-covered fees against Aplos's actual contribution semantics —
explicitly deferred per the approved spec, not guessed. `AplosSyncRecord`/the future contribution-
building input preserves all five values independently so this decision can be finalized later
without any schema rework.

**Missing processor fee data:** if `Payment.actualFinixFeesCents` is null for any included
payment, the settlement is not sent to Aplos and is not permanently failed either — it's held
(`BLOCKED_AWAITING_FEES`, a status distinct from `BLOCKED`) for the cron to retry once fee data
arrives. Processor fees are never estimated.

**Settlements containing refunds/returns/disputes/other adjustments:** if any of
`FinixSettlement.refundAmountCents`, `.returnAmountCents`, `.disputeAmountCents`, or
`.otherAdjustmentAmountCents` is non-zero, the entire settlement is marked `BLOCKED` — never
partially synced. Refund/return/dispute accounting is Phase Two.

**Settlement eligibility:** `FinixSettlement.state === "SETTLED"` is the only finality trigger.
The admin-controlled `reconciliationStatus` field is never required to be manually changed first.
A separate, independent reconciliation check (verifying included payments, gross/fee/net
agreement, and the absence of unsupported adjustments) runs before every sync attempt regardless.

## 6. Open items — confirmed absent from Aplos's documentation, not overlooked

These were checked directly against official docs during Checkpoint 2 and are genuinely
unresolved, not guessed around:

- **No idempotency or external-reference field exists** anywhere in the Contributions API
  request or response, and there is no documented way to search a created contribution by a
  WGC-side reference. `POST /contributions` accepts no `idempotency_id`-style field at all. This
  materially constrains the ambiguous-timeout handling required for Checkpoint 7 — without a
  server-side idempotency key, "verify whether the first request succeeded" cannot rely on Aplos
  alone and may require the pre-write existence check (search by contact + date + amount) to be
  best-effort rather than exact. This needs explicit confirmation before Checkpoint 7 is
  implemented.
- **No documented rate limit.** Aplos's error-handling docs list every HTTP status they use
  (401/403/405/422/500) and a complete exception-code catalog — none of it is a rate-limit
  status. The only guidance found is informal, on the auth page: don't request a new token more
  than once per 30 minutes. `errors.ts` treats an undocumented exception code paired with an
  inferred HTTP 429 as `RATE_LIMITED` defensively, but this is our own inference, not a confirmed
  Aplos behavior.
- **Aplos amounts are decimal dollars, not integer cents** (`"amount": 100` means $100.00,
  `"expense_amount": 3.2` means $3.20). The future `AplosContributionBuilder` must convert from
  this codebase's integer-cents source-of-truth fields via exact decimal string formatting at the
  API boundary only — never float arithmetic, and never before that final boundary.
- **Private-key file format: only ONE format is actually documented.** Aplos's own Java example
  loads a raw base64 PKCS8 DER key (no PEM headers) — that is the only format their documentation
  shows. `authProvider.ts` additionally accepts PEM-formatted keys, but that is this codebase's own
  defensive addition, not something Aplos documents — it must not be described anywhere (UI copy,
  error messages, future docs) as an officially-supported second format. It is provisional and
  isolated to `loadPrivateKey()`. Which format a real Aplos-issued key actually is must be confirmed
  against real pilot credentials (see Pilot Verification Checklist below) before either format is
  called production-ready.
- **Whether "Purpose" and "Fund" need independent mapping** — confirmed they are distinct Aplos
  objects (a Contribution line references a Purpose; each Purpose itself references exactly one
  Fund), so `AplosPurposeMapping` mapping WGC Funds to Aplos Purposes (not Aplos Funds directly)
  is the correct model. Funds are read via `GET /funds` for display/context only.

## 7. Known Aplos API limitation: no idempotency, and the mandatory Checkpoint 7 policy

This is a known, confirmed limitation of Aplos's public API, not a WGC design gap: **`POST
/contributions` has no idempotency field, and Aplos provides no way to search a created
contribution by any WGC-supplied reference.** The only documented search filters on `GET
/contributions` are `f_contact`, `f_contactname`, `f_lastupdated`, `f_rangeend`, and
`f_rangestart` — none of them are a reference WGC controls or can guarantee is unique to one
attempt.

**Investigated: does Aplos accept a harmless WGC label a human could use to identify a
contribution?** Yes, two fields, both confirmed from the real `POST /contributions` request shape:

- `source_url` (contribution-level, top-level field, e.g. `"http://www.sample.org"` in Aplos's own
  example) — a natural place for a safe WGC dashboard URL referencing the settlement.
- `note` (per-line field, e.g. `"A sample comment or note."`) — a natural place for a WGC
  settlement/payment reference string.

**Neither field provides idempotency, automatic lookup, or duplicate detection.** Confirmed:
neither `source_url` nor `note` appears in the documented list-filter set above, so there is no
API call that finds a contribution by either value — a WGC admin would have to open the
contribution in the Aplos UI and read the field visually. **This must never be described,
documented, or implemented as if it provides idempotency or search capability.** Its only value
is helping a human who is already looking at a specific contribution confirm which WGC record it
corresponds to.

**Mandatory policy for Checkpoint 7 (adopted now, binding on that design):**

| Situation | Outcome |
|---|---|
| Timeout or connection loss **before** the POST request is sent | May be retried — the request never reached Aplos, so no duplicate risk exists. |
| A confirmed HTTP response from Aplos (any status) | Classify normally via `errors.ts` — this is not ambiguous; Aplos told us what happened. |
| Timeout, connection loss, or any unknown/unparseable result **after** a contribution POST was sent | **Must become `NEEDS_REVIEW`. Must never be retried automatically, under any circumstance, including via the merchant-facing retry button.** A WGC administrator must manually reconcile the record against Aplos (using `source_url`/`note` to help locate it, per above) before another POST for that settlement is permitted. |

This is already reflected in `errors.ts`'s `classifyNetworkOrTimeoutError("TIMEOUT")`, which
returns `AMBIGUOUS_RESULT` with `retryable: false` — Checkpoint 7's retry service and settlement
sync service must preserve this distinction exactly (pre-send vs. post-send timeout) and must
never let a "Retry" UI action bypass it. `AplosSyncRecord.requiresManualReview` exists in the
Checkpoint 2 schema specifically to enforce this at the data layer, not just in application logic.

## 8. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APLOS_CREDENTIAL_ENCRYPTION_KEY` | Yes, server-only | AES-256-GCM master key for encrypting stored private keys. Base64, 32 bytes. Different value per environment (sandbox vs. production). |
| `APLOS_API_BASE_URL` | No | Overrides the confirmed default `https://app.aplos.com/hermes/api/v1` — for test-double use in integration tests only; Aplos has no separate documented sandbox host. |
| `APLOS_SYNC_ENABLED` | No, defaults `false` | Platform-wide kill switch for the automatic-sync cron, independent of any single organization's `AplosConnection.automaticSyncEnabled`. |

None of these are `NEXT_PUBLIC_*`. Merchant-specific credentials (client ID, private key) are
never environment variables — they live in encrypted, per-church `AplosConnection` rows.

## 9. Pilot verification checklist (blocked — no Aplos credentials available yet)

Everything below requires a real Aplos account and cannot be verified until pilot credentials are
provided. **Nothing in this codebase claims these work** — the auth provider's HTTP call and
decrypt logic are implemented exactly per documentation and unit-tested against locally generated
RSA keypairs, but have never been exercised against Aplos's real servers.

- [ ] `GET /auth/:clientId` against a real client ID returns the documented envelope shape
- [ ] The real private-key file format (PEM vs. raw base64 DER) matches what `authProvider.ts`
      expects — confirm which one a real Aplos dashboard download actually produces
- [ ] Token decryption succeeds against a real encrypted token
- [ ] `GET /partners/verify` confirms organization access
- [ ] `GET /purposes`, `/funds`, `/accounts` return real data in the shapes documented here

## 11. Checkpoint 9 additions: notifications, audit coverage, and security-review fixes

**Notifications** (`notifications.ts`) — best-effort email, following the exact pattern in
`src/lib/support/ticketNotifications.ts` (every attempt logged to `EmailLog`, a failed send never
throws back into the sync flow):

- `notifySyncNeedsReview` — sent to the organization's owner/admin users, plus `SUPPORT_EMAIL` (if
  configured) for WGC awareness. The single most important notification in this integration, since
  only the organization's own Aplos administrator can verify a `NEEDS_REVIEW` outcome.
- `notifySyncFailed` — sent to the organization's owner/admin users only, once a settlement becomes
  terminally `FAILED`.

**Audit coverage** — added `APLOS_MANUAL_RETRY_REQUESTED`, logged by the retry route with the
acting user's identity before calling `requestManualRetry()`, so a manually-triggered retry is
attributable to a specific user (previously only the automated `SYNC_STARTED` event fired, with no
actor).

**Security review fixes** (full findings from an independent review are in the Checkpoint 9
report; the following were confirmed and fixed in this checkpoint, not just noted):

- **Lost-lock race on concurrent freeze.** Every write from `buildSettlementContributions()`
  onward in `processSettlement()` is now a conditional `updateMany` gated on `status: "PROCESSING"`
  (`updateWhileProcessing()` in `syncEngine.ts`), not a plain `update`. Without this, a slow attempt
  could silently overwrite a concurrent stale-`PROCESSING` freeze (from another cron tick) back to
  `RETRY_SCHEDULED`/`FAILED`/`SYNCED` — re-enabling the exact double-POST risk `NEEDS_REVIEW`
  exists to prevent. A lost race now returns the record's real current state instead
  (`reportLostLock()`).
- **Confirmed-contribution bookkeeping persisted incrementally**, not only at the end of an
  attempt — a process crash immediately after Aplos confirms a contribution was created no longer
  loses track of it.
- **Atomic claim.** `claimSyncRecord()`'s find-then-create was replaced with a single `upsert`
  (`update: {}`), closing a race where two concurrent invocations could both attempt to create the
  same row and violate the unique constraint.
- **No back-posting a church's entire settlement history on first enable.** The cron route now
  only considers `FinixSettlement`s with `settledAt >= AplosConnection.connectedAt` — a WGC-side
  policy decision (not an Aplos-documented behavior) to prevent enabling automatic sync from
  silently submitting years of already-manually-entered history as duplicate contributions.
- **Aplos access token reused across a cron tick's settlements for the same church**, instead of
  being re-minted (and the private key re-decrypted) per settlement — Aplos's own auth
  documentation warns against requesting a new token more than once per 30 minutes.
- **Manual-retry route no longer relays raw internal error messages** (e.g. encryption-config or
  Prisma error text) to the client — only `requestManualRetry()`'s two known, fixed safe messages
  are ever returned; anything else becomes a generic message, logged server-side.
- **Auth token fetch now has a 15s timeout**, matching every other Aplos HTTP client in this
  integration (previously unbounded).
- **`sync-history?limit=` no longer 500s on a non-numeric value.**
- **Posted-amount sanity check** — the amount Aplos actually records for a contribution is now
  compared against what was submitted; a mismatch (a well-formed response with the wrong value) is
  treated exactly like an ambiguous outcome (`NEEDS_REVIEW`), never silently accepted as success.

## 10. Status by checkpoint

- **Checkpoint 1 (audit):** complete.
- **Checkpoint 2:** feature branch, Prisma schema, `canManageIntegrations`
  permission, AES-256-GCM encryption + fingerprinting, `AplosAuthenticationProvider` interface,
  `ManualCredentialAuthProvider`, error classification, strict types, tests.
- **Checkpoint 3:** connection wizard, Test Connection flow, connect/disconnect/status routes.
- **Checkpoint 4:** read-only Purposes/Accounts/Funds retrieval and routes.
- **Checkpoint 5:** fund-to-Purpose mapping, deposit/expense/default-Purpose account configuration,
  sync eligibility computation.
- **Checkpoint 6:** settlement reconciliation and contribution-payload builder (network-free);
  isolates the donor-covered-fee accounting-policy ambiguity behind `contributionPolicy.ts`.
- **Checkpoint 7:** `AplosSettlementSyncService`, `/api/cron/aplos-sync`, retry backoff policy, and
  the mandatory ambiguous-POST handling from section 7 above.
- **Checkpoint 8:** merchant sync-activity UI + manual retry action; WGC admin read-only per-church
  and platform-wide `NEEDS_REVIEW`/`FAILED` triage views.
- **Checkpoint 9:** notifications, audit coverage, and security-review fixes — see section 11.
- **Checkpoint 10:** not started.
