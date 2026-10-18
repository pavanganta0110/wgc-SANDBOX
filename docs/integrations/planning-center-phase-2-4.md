# Planning Center — Phases 2–4: Fund mapping, People linking, Gift push

**Build order: 3 → 2 → 4a → 4b.** (Phase numbers are kept from the original plan.)

Status: PLAN (nothing built). Builds on [phase 1](planning-center-phase-1.md)
(connect / disconnect / token refresh, shipped in PR #28).

Sources: Planning Center API docs read 2026-10-13 (Giving `Donation`, `Batch`,
`Fund`, `Designation`, `Refund`, `PaymentSource`; People `Person`; rate limits;
webhooks) and this repo's Aplos integration, which is the closest precedent.
Anything not read from those sources is listed under **Unverified** below.

## 0. Read this first: two corrections to earlier statements

1. **There is no `BackgroundJob` outbox in this repo.** `CLAUDE.md` and
   `docs/ARCHITECTURE.md` describe one; the Prisma schema and `src/` contain no
   such model (the docs have drifted — see `CLAUDE.md` rule 7). Earlier in this
   conversation I described "queue the gift in the same transaction, then a
   background job calls Planning Center". The mechanism that actually exists,
   and that this plan uses, is the one Aplos uses: a **sync-record table with an
   explicit state machine, scanned by a cron route**, with the uniqueness
   guarantee enforced by a database constraint. Fixing the docs is a separate
   follow-up.
2. **A Planning Center donation has no field for our own reference id.** The
   assignable attributes on create are payment method/brand/last4/check fields,
   `fee_cents`, `received_at`, `person`, `payment_source`, `campus`, labels and
   designations. Nothing we can stamp with a WGC payment id. Planning Center also
   has no idempotency key. So duplicate prevention must live entirely on our
   side, and recovering from an ambiguous write (timeout) must be done by
   **reading** Planning Center, never by blindly re-POSTing. §4.4 is built
   around this.

## 1. Goals and non-goals

Goals
- Phase 2: link WGC donors to Planning Center people so gifts can be attributed;
  optionally bring people into WGC as contacts.
- Phase 3: map WGC funds to Planning Center funds; create the "WGC Payments"
  payment source; prove write access.
- Phase 4: push **settled** gifts into the church's Planning Center Giving as
  batches, safely and exactly once.

Non-goals (later): refunds / returned ACH / disputes → Planning Center
(`issue_refund`, `mark_failed`), webhooks for ongoing people sync, importing
Planning Center's non-WGC gifts into WGC. Phase 4 is built so these can be added
without schema rework.

The governing rule from `CLAUDE.md` applies: WGC may get slower; it may never
become financially incorrect. Planning Center is a downstream copy. **No code in
this integration may create, change or reverse a WGC `Payment`.**

## 2. Decisions needed from you (recommended defaults)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Who turns gift sync on | **Per-church opt-in**, only after fund mapping is complete. Never automatic on connect. |
| D2 | Which gifts | **Only gifts settled on/after the moment sync is enabled** (a stored watermark). Past gifts need a separate, explicit "sync past gifts" action later — a church that already keyed gifts into Planning Center by hand must not get duplicates by surprise. |
| D3 | Donor not found in Planning Center | Per-church setting, default **hold for review**: that one gift waits in a review list; the rest of the settlement still pushes. Alternatives: auto-create the person, or send as anonymous. Creating people is off by default because it writes into their People database. |
| D4 | Commit batches automatically? | Default **no**: leave the batch uncommitted so the church's finance admin reviews and commits it in Planning Center (matches how they treat check batches). Until committed, gifts are not in donors' online history or statements. Offer an "auto-commit" switch once a church trusts it. |
| D5 | Donor-covered processing fees | **Open — needs your input.** The Aplos integration blocks any settlement with a donor-covered fee. Planning Center's `fee_covered` can only be true for Stripe payments, so we cannot mirror it. Need a rule for what `amount_cents` and `fee_cents` mean for these gifts before phase 4 ships. See §4.6. |

## 3. Phases 3 and 2 (in build order)

### Phase 3 — Fund mapping and payment source (build this first)

**Why first:** it is small, it needs no donor data, and it contains the first real
write to Planning Center. That makes it the cheapest possible test of whether the
church's Planning Center organization has Giving enabled and the connected user
can write — a prerequisite for everything in phase 4. Phase 2 follows.

**Fund mapping**, modeled on `AplosPurposeMapping`:

```
PlanningCenterFundMapping
  id, churchId, fundId (WGC Fund.id), pcoFundId, pcoFundName
  mappedByUserId, createdAt
  @@unique([churchId, fundId])
```

- UI lists the church's active WGC funds, each with a dropdown of Planning Center
  funds (`GET /giving/v2/funds`) plus **Create in Planning Center**.
- Funds **can** be created via the API (`POST /giving/v2/funds` with `name`,
  `visibility`, optional `ledger_code`/`description`). Funds created by WGC
  default to `visibility: admin_only` so they do not suddenly appear on the
  church's own Church Center donation form. Names must be unique in the org;
  on collision, offer to map to the existing fund instead.
- A **default fund** (`GET /giving/v2/funds?where[default]=true`) is used for gifts
  with no `fundId`. Stored in the sync config below.
- "Refresh funds" re-reads Planning Center and flags mappings whose fund was
  renamed, hidden (`visibility: nowhere`) or deleted.

**Payment source**

- Create a payment source named `WGC Payments` (`POST /giving/v2/payment_sources`;
  name must be unique in the org — on collision, reuse the existing one). Gifts
  from other platforms (Square, Pushpay…) are expected to use their own source;
  `planning_center` itself is reserved and cannot be used.
- This call is also the **first real write**, so it doubles as the write-access
  probe: success sets `canWriteGiving = true`; a 403 sets it `false` and shows
  "the connected Planning Center user needs the Finance Administrator
  permission". This resolves the phase 1 "can't access Giving" warning loop
  properly (that warning only ever knew about *read* access).

**Sync configuration** (kept off `PlanningCenterConnection` so connection state
and sync policy stay separate):

```
PlanningCenterSyncConfig
  churchId @unique
  syncMode              OFF | DRY_RUN | LIVE        (default OFF)
  enabledAt             DateTime?   // D2 watermark; set when moved to LIVE
  pcoPaymentSourceId    String?
  defaultPcoFundId      String?
  unmatchedDonorPolicy  HOLD_FOR_REVIEW | CREATE_PERSON | ANONYMOUS   (D3)
  autoCommitBatches     Boolean @default(false)     (D4)
  pcoOrganizationId     String      // config is only valid for this org
  syncVersion           Int @default(1)
```

**Eligibility** (a pure function, like `computeSyncEligibility` for Aplos): can
move to `DRY_RUN`/`LIVE` only when connected and healthy, `canWriteGiving` is
true, payment source exists, every active WGC fund is mapped (or a default fund
is set), and `pcoOrganizationId` still equals the connection's. If the connected
organization changes, sync drops to `OFF` and `syncVersion` increments so old
sync records can never be mistaken for the new account's.

### Phase 2 — People linking (build second)

**What it is:** a durable link between a WGC `Donor` and a Planning Center person,
used only to attribute gifts in phase 4. It is *not* a full two-way people sync.

New table:

```
PlanningCenterPersonLink
  id, churchId, donorId, pcoPersonId, pcoOrganizationId
  status        LINKED | NEEDS_REVIEW | REJECTED
  matchMethod   EMAIL | PHONE | MANUAL | CREATED
  matchedAt, linkedByUserId, lastCheckedAt
  @@unique([churchId, donorId])
  @@unique([churchId, pcoPersonId])      // one person ↔ one donor
```

**Matching** (service function, also used lazily during phase 4): look up with
`GET /people/v2/people?where[search_name_or_email_or_phone_number]=<value>`
(`include=emails,phone_numbers` so one request returns the contact details to
confirm the match), trying normalized email, then E.164 phone — the same
normalized fields `Donor` already stores.

Rules, in priority order:
- **Exactly one** Planning Center person matches → auto-link, `LINKED`.
- **More than one** match → `NEEDS_REVIEW`, never auto-link. Spouses and
  household members commonly share one email; guessing here would attribute a
  gift to the wrong person on the wrong tax statement.
- **Zero** matches → no link; behavior follows D3.
- Never match on name alone (same rule as `resolveOrCreateDonor`).
- Skip Planning Center people who are inactive, and treat `child` records as
  non-matches.

**Bulk match action** ("Match donors to Planning Center"): a resumable, chunked
job in the style of `QuickBooksBackfillJob` / `BulkReceiptJob` (create the job,
UI repeatedly calls `.../process` until `COMPLETED`). Reads donors
that have a gift and no link, batches lookups, honors the rate limit (§4.5), and
produces a review list of ambiguous and unmatched donors.

**Optional import** ("Import people from Planning Center as contacts"): same
chunked-job shape; creates `Donor` rows through the existing
`resolveOrCreateDonorWithMatchReview` (so fuzzy collisions go to
`PossibleDonorMatch`, not silent merges), sets `contactSource = "PLANNING_CENTER"`,
fills only **blank** fields on existing donors and never overwrites. Skips people
with neither email nor phone, inactive people and children. Off unless the church
clicks it. Uses `per_page=100` with `include=` to avoid N+1 calls; note
Planning Center applies a stricter limit for offsets above 30,000, so large
directories should be walked with `where[updated_at]` windows rather than a
single huge offset.

**Edge cases to handle explicitly**
- **Donor merge** (`donorMerge.ts`): links must move to the survivor; if both
  donors were linked to different people, the survivor keeps the stronger link
  and the other goes to `NEEDS_REVIEW`.
- **Disconnect / reconnect to a different Planning Center organization**:
  links carry `pcoOrganizationId`; a different org invalidates them (set
  `REJECTED`, require re-matching). Same org reconnecting keeps them.
- **Person merged or deleted in Planning Center**: a lookup returning 404 marks
  the link `NEEDS_REVIEW`, never silently re-links.

**UI:** a "People" tab on the Planning Center page: counts (linked / needs review
/ unmatched), the review list with "link to this person" / "not the same person",
and the two actions above.

## 4. Phase 4 — Gift push

### 4.1 Unit of work: one Planning Center batch per WGC settlement

Same trigger the Aplos integration uses: a `FinixSettlement` in state `SETTLED`.
One settlement → one Planning Center **batch**, described as
`WGC settlement <finixSettlementId> · <deposit date>` so the church can match it
to their bank deposit and so we can find it again after an ambiguous failure.
Only settlements with `settledAt >= SyncConfig.enabledAt` are considered (D2).

Unlike Aplos, **a settlement containing refunds, returns or disputes is not
blocked** — those adjustments do not change which gifts exist, and blocking would
stall unrelated gifts. Gift push only ever *adds* gifts; correcting a gift that
was later refunded is a later phase, and a payment already `REFUNDED`/`FAILED`
before we push is simply skipped.

Reuse, don't copy, where possible: the settlement/payment/fee reconciliation in
`aplos/settlementReconciliation.ts` is partly Aplos-specific
(`MAPPING_REQUIRED`, `ACCOUNT_CONFIGURATION_MISSING`). Extract the
provider-neutral parts (settled? every payment present? fees landed? totals
reconcile?) into a shared module rather than duplicating them, and leave Aplos'
behavior unchanged and covered by its existing tests.

### 4.2 Tables

```
PlanningCenterSyncRecord              // one per settlement per syncVersion
  id, churchId, settlementId, syncVersion
  status   PENDING | PROCESSING | BLOCKED | BLOCKED_AWAITING_FEES |
           SYNCED | FAILED | RETRY_SCHEDULED | NEEDS_REVIEW | CANCELLED
  blockedReason, attemptCount, nextAttemptAt, lastAttemptAt   // lastAttemptAt = heartbeat
  pcoBatchId, batchDescription
  expectedGiftCount, expectedTotalCents
  commitStatus  NOT_COMMITTED | COMMITTING | COMMITTED | N_A
  lastErrorCode, lastErrorMessage, requiresManualReview
  @@unique([churchId, settlementId, syncVersion])

PlanningCenterDonationRecord          // one per WGC payment, ever
  id, syncRecordId, churchId, paymentId
  status   PENDING | CREATED | SKIPPED | NEEDS_REVIEW | FAILED
  pcoDonationId, pcoPersonId, pcoFundId
  payloadHash, skippedReason, lastErrorCode, lastErrorMessage
  @@unique([churchId, paymentId])     // <-- the core duplicate guarantee

PlanningCenterSyncAttempt             // append-only audit, like AplosSyncAttempt
```

The key constraint is `@@unique([churchId, paymentId])`: **a WGC payment can be
pushed at most once, enforced by the database**, regardless of retries, a bumped
`syncVersion`, or a backfill. (Aplos guarantees this per settlement; per-payment
is stronger and is what actually matters here.) Attempt rows never store
tokens, authorization headers or card/bank data.

### 4.3 State machine

Mirror the Aplos machine and its rules (see `docs/integrations/aplos.md` §1, §7):

- `PENDING → PROCESSING`: claimed with a **conditional update**
  (`where status IN (PENDING, RETRY_SCHEDULED due)`), so two overlapping cron
  runs cannot both start the same settlement.
- A `PROCESSING` record whose heartbeat is older than 15 minutes is an
  interrupted attempt of unknown outcome and is frozen into `NEEDS_REVIEW` —
  not silently resumed (same policy as Aplos) — **except** that §4.4's read-based
  reconciliation is attempted first, which can often prove what happened and
  resume safely.
- `BLOCKED_AWAITING_FEES`: settlement is fine but Finix's async fee sync
  (`Payment.actualFinixFeesCents`) hasn't landed; retried by cron.
- `RETRY_SCHEDULED`: transient failures (5xx, network, rate limit) with backoff
  and a cap (`retryPolicy.ts` pattern). `NEEDS_REVIEW` is never auto-retried.
- `SYNCED` means every gift is `CREATED` or deliberately `SKIPPED`, the batch
  totals were verified against WGC (§4.4 step 5), and — only if D4 auto-commit is
  on — the commit completed.
- Any change moves through one service function so every transition is audited
  via `logDashboardAction`.

### 4.4 The write protocol (the part that must not be improvised)

Because there is no idempotency key and no place to put our id on a donation,
every step persists progress **immediately after** Planning Center confirms, and
every ambiguous result is resolved by a read:

1. **Claim** the record (conditional update, heartbeat set). Verify
   `SyncConfig.syncMode`, connection `CONNECTED`, org id unchanged.
2. **Build** the full set of donation payloads purely from persisted WGC data
   (no network), upsert `PlanningCenterDonationRecord` rows as `PENDING`
   (the unique constraint makes this safe to repeat), compute `payloadHash`.
3. **Ensure the batch.** If `pcoBatchId` is already stored, reuse it. Otherwise
   `POST /giving/v2/batches {description}` and store the returned id
   **before doing anything else**. If that request times out or errors
   ambiguously, do **not** re-POST: first `GET /giving/v2/batches?order=-updated_at`
   (reads are retry-safe) and look for our exact description. Found → adopt it.
   Not found after the lookup → one create attempt is safe.
4. **Create donations**, one `POST /giving/v2/batches/{id}/donations` per
   `PENDING` gift (with its single designation), storing `pcoDonationId` the
   moment it returns. Time-boxed per cron tick (see §4.5); progress is the DB,
   so the next tick simply continues with whatever is still `PENDING`.
   An ambiguous POST (timeout, connection reset, and — conservatively — 429)
   marks that gift `NEEDS_REVIEW` for now, then reconciles by reading
   `GET /giving/v2/batches/{id}/donations`: if a donation with the same person,
   amount and `received_at` exists that we have not recorded, adopt it; if
   counts/sums prove it was *not* created, reset to `PENDING`. If still
   undecidable, it stays `NEEDS_REVIEW` for a human — never auto-retried.
5. **Verify** before declaring done: read the batch (`donations_count`,
   `total_cents`) and compare with `expectedGiftCount`/`expectedTotalCents`
   from WGC. Mismatch → `NEEDS_REVIEW` and **do not commit**.
6. **Commit** only if D4 auto-commit is on: `POST .../commit`, which is
   asynchronous (batch goes `updating` → `committed`); poll on later ticks and
   record `commitStatus`. Never commit an unverified batch.

Hard rules: no external HTTP inside a DB transaction; POSTs go through the
phase 1 client, which never retries them; one church is processed with no
concurrency (rate limits are per authorized user).

### 4.5 Throughput and rate limits

The default is 100 requests per 20 seconds per authenticated user, adjustable
by Planning Center at any time. Roughly one request per gift plus the batch
calls means about 5 gifts/second/church at best; a 1,000-gift settlement takes
minutes and will not fit in one serverless invocation. Therefore:

- Each cron tick works against a **time budget** (e.g. 45 s) and a request
  budget derived from the `X-PCO-API-Request-Rate-*` headers, then stops cleanly;
  the heartbeat keeps the record alive and the next tick continues.
- Person lookups are cached in `PlanningCenterPersonLink`, so a returning donor
  costs zero lookups.
- Process churches round-robin so one large church cannot starve the rest.
- Cron every ~15 minutes (`planning-center-sync`), wrapped in
  `withJobRunTracking`, bearer-checked with `CRON_SECRET`, behind a new platform
  kill switch `PLANNING_CENTER_SYNC_ENABLED` (default **off**), in addition to
  the per-church mode.

### 4.6 Field mapping (confirm with a real account before enabling LIVE)

| Planning Center field | From WGC |
|---|---|
| `payment_source` | the church's "WGC Payments" source |
| `payment_method` | `card` or `ach` from the Finix payment instrument |
| `payment_brand` / `payment_last4` | card brand + last4; for ACH the bank name + last4 |
| `payment_method_sub` | `credit` / `debit` / `prepaid` / `unknown` for cards |
| `received_at` | the gift's **original donation date**, not the deposit date (same choice Aplos makes) |
| designation `amount_cents` + `fund` | gift amount, via the fund mapping or the default fund |
| `fee_cents` | the processing fee as a **negative** integer, once fees have landed |
| `person` | from the person link; **omitted** when the gift or donor is anonymous |
| `campus` | left to Planning Center's default (the donor's primary campus) |

Privacy: if `Payment.isAnonymous` or `Donor.anonymousPreference` is set, the gift
is pushed **without** a person (it shows as "Anonymous Donor"). We must never
attach a name the donor asked us to withhold.

Open (D5): donor-covered fees. Until decided, such gifts are `SKIPPED` with a
visible reason ("donor-covered fee not yet supported") rather than pushed with a
guessed amount.

### 4.7 Operations and visibility

- **Sync page** on the Planning Center settings screen: per-settlement status,
  gift counts, linked Planning Center batch, commit status; "Retry" for
  `RETRY_SCHEDULED`/`FAILED`; a Needs Review list with plain-language
  instructions ("open batch X in Planning Center and compare…") and a
  "mark resolved" action that records who decided.
- **Dry run** (`syncMode = DRY_RUN`): runs steps 1–2 only — builds and stores the
  payloads and shows exactly what *would* be sent — with zero Planning Center
  writes. Required before any church goes `LIVE`.
- **Notifications:** email the church's integration admins on `NEEDS_REVIEW`,
  repeated failure, and `REAUTHENTICATION_REQUIRED` (the latter closes the gap
  left in phase 1). Reuse `aplos/notifications.ts` patterns.
- **Monitoring:** per-run counts in `JobRun`; a health signal in the same place
  `aplosHealth` reports; an admin-visible count of stuck `NEEDS_REVIEW` records.
- **Audit:** every transition via `logDashboardAction`
  (`planningcenter.sync_*` events).

## 5. Schema and PR breakdown

Schema applies through `prisma db push` on build (no migration files), so every
model above must be **purely additive** — no renames or drops — to stay safe
under `--accept-data-loss`.

| PR | Contents | Writes to Planning Center? |
|---|---|---|
| 3 | `FundMapping`, `SyncConfig`, fund UI, payment-source creation + write probe | Yes — creates a payment source and (on request) funds |
| 2 | `PlanningCenterPersonLink`, matching service, bulk-match job + People tab, optional contact import | No (reads only) |
| 4a | Sync tables, shared reconciliation extraction, builder, state machine, `DRY_RUN` only, cron behind kill switch | No |
| 4b | Live write protocol, batch verify + optional commit, notifications, sync page | **Yes — gifts** |

Splitting 4a/4b means the engine is reviewed, tested and run in dry-run against
real settlements before it can touch a church's ledger.

## 6. Test plan

Unit/contract tests with a mocked `fetch` (the phase 1 pattern), one per rule:

- Matching: single match, two matches (shared email), zero, phone-only, name-only
  (never matches), merged donor, different organization.
- Eligibility: each missing prerequisite blocks; org change forces `OFF`.
- State machine: conditional claim (two concurrent claims → one winner);
  stale `PROCESSING` → reconcile-then-`NEEDS_REVIEW`; fees-pending; retry cap.
- **Write protocol** (the critical set): timeout creating the batch → lookup finds
  it → adopted, no second create; timeout on a donation POST → reconciliation
  proves created / proves not created / undecidable; crash after batch create
  and before storing the id; crash mid-batch → resume creates only `PENDING`
  gifts; unique constraint rejects a second record for the same payment; totals
  mismatch → no commit; 403 on write → `canWriteGiving=false`, sync pauses;
  **a POST is never retried** (assert fetch call counts).
- Privacy: anonymous gift/donor produces a payload with no `person`.
- Payload: negative `fee_cents`, original `received_at`, correct method/brand/last4.
- Aplos regression: its existing suites pass unchanged after the shared extraction.

Then a manual pilot checklist (against a real Planning Center sandbox
organization with Giving enabled): connect → match → map funds → create source →
dry run → live on one test settlement → verify batch contents and totals in
Planning Center → commit → confirm donor history/statement → intentionally
re-run to prove no duplicates.

## 7. Rollout

1. Ship 3, then 2, with sync mode `OFF` everywhere.
2. Ship 4a; run `DRY_RUN` for a pilot church for at least a few settlements and
   compare the would-be batches to what the church actually has.
3. Ship 4b with `PLANNING_CENTER_SYNC_ENABLED` still off; enable for the pilot
   church only; D4 auto-commit **off**.
4. After clean batches, offer auto-commit; only then open to other churches.
5. Submit the Planning Center integrations-page listing after a successful pilot.

## 8. Unverified assumptions (check against a real account)

- `POST /people/v2/people` can create a person with the fields we have (needed
  only for the `CREATE_PERSON` policy and the `CREATED` match method).
- Planning Center accepts a back-dated `received_at`, and `payment_brand` /
  `payment_last4` as free text for ACH.
- `?fields[Batch]=donations_count` works as the docs imply for verification.
- A 429 or timeout on POST leaves no donation created is **not** assumed — the
  protocol treats both as ambiguous and reads to decide.
- A free/developer organization actually has Giving enabled and permits writes
  (the phase 1 warning on org `O546268` suggests it may not).
- The People version pinned in the OAuth app (`2026-10-05`) returns the shapes
  used here.
- Webhook-driven refresh is out of scope; people changes are picked up on demand.

## 9. Open questions

1. D1–D5 above.
2. Should the church see Planning Center sync status inside WGC's existing
   settlement detail page as well as on the integration page?
3. Do we need a per-giving-link or per-campaign mapping to Planning Center
   campuses, or is the default campus enough?
4. Who is notified — all admins with `canManageIntegrations`, or a single
   configurable address?

## 10. Phase 3 — as built

Shipped in the phase 3 PR (build order is 3 → 2 → 4a → 4b).

- **Schema (additive only):** `PlanningCenterSyncConfig` (payment source, default
  fund, the Planning Center organization it belongs to, `syncVersion`) and
  `PlanningCenterFundMapping` (`@@unique([churchId, fundId])`). The sync-mode,
  watermark and policy columns from §3 are **not** added yet; they arrive with
  phase 4a so nothing sits unused.
- **Library** (`src/lib/integrations/planningcenter/`): `givingApi.ts` (typed
  Funds / PaymentSources calls), `givingSetup.ts` (the setup service),
  `givingTypes.ts` (UI-safe types + `evaluateGivingReadiness`, the single
  definition of "ready"), `syncConfig.ts` (config, organization-change reset,
  stored-data readiness for the future sync engine), `routeAuth.ts` (shared
  route guard: session church, `canManageIntegrations`, kill switch, error
  mapping).
- **Routes** under `/api/merchant/settings/integrations/planning-center/giving`:
  `GET` (live state), `POST payment-source`, `PUT default-fund`,
  `PUT fund-mappings`, `POST fund-mappings/create`, `POST fund-mappings/auto-match`.
- **UI:** a "Giving setup" panel under the connection card (payment source →
  default fund → fund matching), with a readiness banner, exact-name
  suggestions, one-click "Match by name", and plain-language failure states.
- **Behavior worth knowing:**
  - Funds are re-read from Planning Center on every load and before every save,
    so a mapping can't be saved to a fund that was deleted or is set to
    visibility `nowhere`.
  - A broken mapping **blocks** readiness even when a default fund exists, so
    gifts are never silently rerouted to the default.
  - Unmapped funds are allowed and use the default fund, shown as a visible note.
  - Funds created from WGC are `admin_only`, so they never appear on the
    church's own donation form. A same-name fund is never duplicated.
  - Setting up the payment source is idempotent and doubles as the write
    probe: an existing source is re-saved with its own name (a no-op for the
    data) to prove write access; an archived one is reactivated.
  - Reconnecting to a **different** Planning Center organization clears the
    payment source, default fund and every mapping and bumps `syncVersion`;
    reconnecting to the same one keeps them.
  - Every write is audit-logged (`planningcenter.payment_source_ready`,
    `fund_mapped`, `fund_unmapped`, `fund_created_and_mapped`,
    `fund_auto_matched`, `default_fund_set`).

### Unverified in phase 3 (check against a real Giving-enabled organization)

- `POST /giving/v2/payment_sources` with only a `name`: the docs also list
  `payment_source_type` as assignable; if it is required, creation will be
  rejected and we'll need to send it.
- A 404 from `/giving/v2/*` is treated as "Giving isn't enabled for this
  organization". That is an inference, not documented behavior.
- A duplicate fund or payment-source name returns a 4xx we classify as a name
  collision (we also check names first, so this only matters in a race).
- `PATCH /giving/v2/payment_sources/{id}` with an unchanged name is accepted.
- `visibility: admin_only` for API-created funds does what the docs describe.

## 11. Phases 2 and 4 — as built

Built together (people linking, gift sync engine, dry run and live, UI). **Everything ships switched off**: the
platform switch `PLANNING_CENTER_SYNC_ENABLED` defaults to false and every church's mode defaults to OFF.

### What exists
- **People** (`people.ts`, `personMatching.ts`, `peopleJobs.ts`, `peopleOverview.ts`): the matching rules in §3, a
  review list, manual link / reject / unlink / re-check, a chunked "match my donors" job, an optional "import people
  as contacts" job (sets `contactSource = PLANNING_CENTER`, fills blanks only), and a merge hook so a donor merge
  moves the link to the surviving donor (best-effort; it can never break a merge).
- **Planning** (`giftPlan.ts`, `giftPayload.ts`): DB-only plan of what to send for a settled deposit. Skips, with a
  stated reason: refunded, partly refunded, returned, not succeeded, goods or services, unsupported payment method.
  **Gifts where the donor covered the fee are sent** (see "Donor-covered fees" below). Pure payload builder with a stable hash.
- **Engine** (`syncEngine.ts`, `syncReconcile.ts`): the write protocol in §4.4, exactly as designed. One batch per
  deposit; `PlanningCenterDonationRecord @@unique([churchId, paymentId])`; a donation is `SENDING` before its POST;
  an unknown outcome is settled only by reading the batch, only concluding "never landed" after a 2-minute grace
  period, and never auto-retried beyond a cap (it becomes NEEDS_REVIEW). Batches are verified before any commit.
- **Runner and cron** (`syncRunner.ts`, `/api/cron/planning-center-sync` and the token refresh, both **daily**).
  Both are in `vercel.json` and are no-ops while the platform switch is off. They are daily because this Vercel plan
  only allows once-a-day crons: a sub-daily schedule makes Vercel reject the whole deployment (this happened to the
  first version of this feature, which used every 15 minutes). A large deposit therefore advances once per day, or on
  demand with "Sync now". A paid plan would allow a tighter schedule.
- **Settings and actions** (`syncActions.ts`): turning sync on requires complete Giving setup and the platform switch;
  **LIVE requires a completed preview**; the go-live watermark is set when sync first goes LIVE and cleared when it is
  turned OFF; retry; resolve a flagged gift ("it isn't there, send it" / "don't send"); "Sync now".
- **UI**: People panel and Gift sync panel under the Planning Center settings page.
- **Notifications**: needs-review and failed (once per state), and the reconnect-required email that phase 1 lacked.

### Deviations from the plan
- The Aplos reconciliation was **re-implemented, not extracted**, so the shipped Aplos integration is untouched.
- A settlement containing refunds is **not blocked** (only the affected payment is skipped).
- **Refunds, returns and disputes after a gift was sent are not corrected in Planning Center.** They are listed under
  "Changed after it was sent" so the church can fix them there. Automatic correction (`issue_refund` / `mark_failed`)
  is a later phase.
- `received_at` uses the UTC date of the original donation (same as the Aplos sync); late-evening US gifts can land
  on the next calendar day.
- A stored preview is not recomputed every tick; use "Refresh preview".

### Verification status
- Engine tests inject faults into a fake Planning Center and database: timeouts that did and didn't land, a crash
  between a send and its record, two workers claiming the same deposit (with a barrier forcing the race), verification
  mismatches, hand-added gifts in the batch, rate limits and outages. Deliberately breaking the grace period, the
  claim check and the "read before resend" rule each makes tests fail.
- **Not run against a real Planning Center organization.** Treat the first live deposit as a pilot: preview first,
  one church, auto-commit off.

### Additional unverified assumptions
- `POST /giving/v2/batches/{id}/donations` accepts `received_at` as `YYYY-MM-DD` and back-dated values, and
  `payment_brand` / `payment_last4` as free text.
- `GET /giving/v2/batches/{id}/donations` returns `person` and `payment_source` relationships and `amount_cents`
  (reconciliation and verification depend on it).
- `POST /people/v2/people` (+ `/emails`, `/phone_numbers`) works with the attributes sent (CREATE_PERSON only).
- `GET /giving/v2/batches?order=-updated_at` can find a batch by exact description among the latest 200.
- Batch `commit` goes `updating` then `committed`, and re-committing an already committed batch is rejected, not harmful.

### Donor-covered fees (decided; supersedes the earlier "skip")
Decision from Collin Sansom: **A**. A gift where the donor covered the processing fee is sent to Planning Center at the
**gift amount without the fee** ($250 when the donor was charged $250.25), the same figure the donation receipt uses.
- `fee_cents` is **0** for those gifts: the donor paid the fee, so the church bore no cost. For gifts where the donor did
  not cover the fee, `fee_cents` is the real processing cost (negative), as before.
- Planning Center has no field to show the covered fee separately (`fee_covered` can only be true for Stripe), so it
  appears only on WGC's own documents.
- Fee-covered gifts no longer wait for Finix fee data (there is no church cost to record).
- Collin's condition: the year-end statement must stay clear for tax purposes. The statement counts the covered fee in
  the donor's total ($250.25) and shows it on its own "Donor-Covered Transaction Costs" line **only if the church's
  `statementShowDonorCoveredFees` setting is on** (default off). Recommendation sent to Collin: turn that on by default.
  Not changed here; it alters existing churches' statements.
- Switching to B later is a one-line change in `giftPlan.ts`. Gifts already sent keep the amount they were sent at.

### Receipt fix shipped alongside
The church setting `receiptShowDonorCoveredFee` existed (and showed in the settings preview) but was never passed to the
real receipt, so turning it on did nothing. The receipt PDF and email now show "Processing Fee Covered by Donor" and
"Total Charged" when the setting is on and the donor covered a fee.

## 12. Send when it's paid — as built

Gifts now go to Planning Center **the moment they succeed** instead of waiting for the bank deposit. Connecting Planning Center sets everything up. The old per-deposit mode still exists as `sendTiming = ON_SETTLEMENT`; `ON_PAYMENT` is the default.

### Day batches
- One Planning Center batch per church per UTC day (`unitKey = day:YYYY-MM-DD`, description `WGC gifts · YYYY-MM-DD`). Settlement units are unchanged.
- Trigger: `syncTrigger.ts` runs after a payment succeeds (donate route, `take-payment`, Finix webhook, recurring create). It runs through Next's `after()`, so the donor's response is never delayed, and it never throws. All hooks are no-ops while `PLANNING_CENTER_SYNC_ENABLED` is off.
- Safety net: the daily cron's `sweepDays` (90-day lookback; 14 in preview) picks up anything the trigger missed.
- Duplicate protection is unchanged: `@@unique([churchId, paymentId])`, SENDING marked before the POST, and an unknown outcome is settled only by reading the batch (2-minute grace).
- A flagged gift (NEEDS_REVIEW/FAILED) never stops the rest of the day. The day becomes PARTIAL with a message.
- Batches are never auto-committed by default (`autoCommitBatches false`); the church reviews and commits in Planning Center.

### Refunds and returns (important finding)
A refund or bank return does **not** change `Payment.status`. Status is derived in `giftOutcomes.ts` from refund and return rows. Both plans, the reversal job and the overview use it. A `REFUND_PENDING` payment is not sent.

### Reversals (`syncReversals.ts`)
If a sent gift is later fully refunded/returned: re-read the donation; if the batch is still open, delete it; otherwise `issue_refund` (refund) or `mark_failed` (return/failure). The result is confirmed by reading again. Only a definite rejection flags `REVERSAL_NOT_APPLIED`; the UI then offers "Check again" / "I handled it in Planning Center" (never "send it" — the gift is already there). Partial refunds are listed under "changed after it was sent" for the church to handle.

### Unmatched donors: attach later
New policy `ATTACH_LATER` (recommended): send the gift now with no person, then PATCH the person onto the donation once the donor is matched (`syncAttach.ts`). Attach happens only after the link is confirmed, is verified by read-back, and is idempotent. Anonymous donors/gifts are never attached.

### Auto-setup (`autoSetup.ts`)
After OAuth connect, `after()` creates the payment source, picks a default fund, applies suggested fund mappings, creates Planning Center funds for unmapped active WGC funds, and — only if giving readiness passes — sets sync LIVE / `ON_PAYMENT` / `ATTACH_LATER`. Failures leave sync OFF with a reason. The "LIVE requires a preview first" gate is removed (readiness is still required).

### Fee-covered gifts
Sent as the gift amount **without** the fee (option A, per Collin). Switching later is a one-function change in `classifyPayment`.

### "Same person? Merge"
Planning Center people that are already linked to another WGC donor show "Yes, same person — merge" (`sameDonorMerge.ts`, action `MERGE`). The donor to keep is decided server-side from the link table; the other donor is archived, not deleted.

### Schema (additive)
`PlanningCenterSyncConfig.sendTiming`, `PlanningCenterDonationRecord.attachPersonPending`, `reversedAt`.

### Still unverified against a real account
PATCH of a donation's person via relationships; DELETE and `issue_refund`/`mark_failed` on batch donations; back-dated `received_at`; `POST /payment_sources` with only a name; the donations list returning `person`/`payment_source` relationships; a 404 on Giving meaning "not enabled". Test with a sandbox church before turning the platform switch on for real churches.

## 13. People only — giving on the person's profile (no donations)

A church chooses **what WGC sends** (`PlanningCenterSyncConfig.syncTarget`):

| | `GIFTS` (default) | `PROFILE_FIELDS` |
|---|---|---|
| Donations in Planning Center Giving | one per gift | none |
| Giving visible in Planning Center | full history, batches, funds, statements | a "WGC Giving" section on each matched person |
| Planning Center cost | Giving subscription (priced by gifts/month) | none (People is free) |
| Needs Giving setup | yes | no, only a working connection |

Why: Planning Center prices Giving by the number of donations recorded per month (free up to 10), and processing at 2.15% + $0.30 per card gift. Moving payments to WGC removes processing fees either way; people-only also removes the subscription.

### Built
- `profileFields.ts` — creates the "WGC Giving" tab and 10 fields once (People API: `POST /people/v2/tabs`, `POST /people/v2/tabs/{id}/field_definitions`) and writes per-person values (`POST /people/v2/people/{id}/field_data`, `PATCH /people/v2/field_data/{id}`). It always LOOKS first (by name) so a lost response can never create a second tab/field/value, and writes only what differs. Every field's name/type lives in one table (`PROFILE_FIELDS`).
- `profileSummary.ts` — the numbers, from WGC's own data: this year / last year / lifetime / count / first and last gift / last amount / recurring / main fund / a link to the donor in WGC. Gift amount excludes a donor-covered fee; refunds and bank returns come out; anonymous gifts and gifts that gave goods or services are never counted; UTC years.
- `profileSync.ts` — `syncProfileForDonor` (on every payment change, via the same `after()` trigger) and `syncProfilesForChurch` (the daily sweep). A fingerprint (`PlanningCenterPersonLink.profileDigest`) means nothing is written again until the summary changes; a link is re-verified weekly, which repairs a value someone deleted. Only people already matched are written; an unmatched donor is looked up, **never created**; an anonymous donor is never written.
- `profilePreview.ts` + `GET .../sync/profile-preview` — how profiles will read, for real donors, with no Planning Center call. Shown in the Gift sync panel before turning it on.
- Settings: switching target is a confirmed action. LIVE + people-only creates the section immediately, so a church that isn't allowed to add one finds out at once. Switching back to gifts restarts the go-live clock so gifts made while on people-only are never sent later as donations.

### What a church must understand (shown in the UI)
Planning Center's own giving screens, reports and any "has given" list are built from Giving donations, so gifts that went through WGC don't appear there: a donor who gave recently can look lapsed in those views. Lists must be built on the "WGC Giving" fields. The section shows totals, not individual gifts; the link opens the full detail in WGC. "Given last year"/"Lifetime" are correct only for the history WGC holds, so a church that wants them complete imports its Planning Center history first (CSV Migration Center today; a direct import is not built).

### Unverified against a real account (test in a sandbox church first)
- `number` fields accepting two decimals and `date` fields accepting `YYYY-MM-DD` (if not, change the type in `PROFILE_FIELDS`).
- Which Planning Center permission is needed to add a tab (assumed: a People administrator).
- Whether a text field renders a URL as a clickable link.
- Whether custom-field tabs are visible to the staff who need them under the church's own People permissions.
- Rate limits at scale: one read plus up to ten writes per person on first fill; the sweep is resumable and stops on a rate limit.

## 14. Disconnect: delete stored people data; neutral fee comparison

**Disconnect** always revokes the Planning Center token, clears our copy, and turns sending OFF (so nothing resumes by surprise on a later reconnect). The church can also tick **"Also delete the Planning Center people data WGC stored"** (on by default). That runs `purgePlanningCenterPeopleData` (`purge.ts`), for this church only:
- DELETED: every matched-person record (Planning Center person id and name, the candidate names/emails/phones kept while a match awaited review, the profile-write fingerprint), the match/import job history, and the stored ids of the "WGC Giving" profile section.
- KEPT on purpose: donors already in WGC, including any created by "Import people" (they carry payments and tax receipts; deleting a donor is a separate, deliberate action), the record of gifts sent (amounts, dates, Planning Center donation ids), and the church's fund choices.
- The audit entry records whether data was deleted and how many rows.

**Fee comparison in the app** no longer claims a saving. For the last 30 days it shows what the church paid in WGC fees (exact, from the rate saved on each payment; a gift whose donor covered the fee costs the church nothing) next to about what Planning Center's published rates (2.15% + $0.30 card, $0.30 bank) would have been if the church paid the fee, and says Planning Center also lets donors cover the fee. It is "not available" rather than a guess when a payment has no saved rate. This is the same like-for-like standard the legal risk assessment (R1) asks of the landing page.
