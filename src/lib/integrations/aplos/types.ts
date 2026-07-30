/**
 * Strict types for Aplos API shapes, taken directly from official
 * documentation fetched during Checkpoint 2 (help.aplos.com, "Aplos Open
 * API" section) — never guessed. Every external response is validated at
 * runtime with the isX() type guards below before being trusted; this
 * codebase has no runtime-validation library (no zod/yup/joi present), so
 * these follow the same hand-rolled typeof-narrowing pattern already used
 * elsewhere (e.g. isSafeString in the diagnostics routes) rather than
 * introducing a new dependency.
 *
 * Only the auth + envelope + error shapes are used by Checkpoint 2's scope
 * (AplosAuthenticationProvider). Purpose/Fund/Account/Contribution types are
 * included now because their shapes are already confirmed from docs and the
 * approved file list calls for strict types up front — but nothing in this
 * checkpoint wires them to a live call.
 */

// ---------------------------------------------------------------------------
// Envelope common to every Aplos API response
// (confirmed shape: { version, status, data | exception, meta?, links? })
// ---------------------------------------------------------------------------

export interface AplosApiEnvelope<T> {
  version: string;
  status: number;
  data?: T;
  meta?: { resource_count?: number; available_filters?: Record<string, string> };
  links?: { self?: string; next?: string; prev?: string; transaction?: string };
  message?: string;
  exception?: AplosApiException;
}

export interface AplosApiException {
  message: string;
  code: number;
}

export function isAplosApiException(value: unknown): value is AplosApiException {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).message === "string" &&
    typeof (value as Record<string, unknown>).code === "number"
  );
}

// ---------------------------------------------------------------------------
// Authentication (GET /auth/:clientId) — confirmed via
// help.aplos.com "API: Authentication"
// ---------------------------------------------------------------------------

export interface AplosAuthData {
  expires: string; // ISO 8601 with offset, e.g. "2015-12-31T23:59:59.000-0700"
  token: string; // base64, RSA/PKCS1Padding-encrypted with the org's public key
}

export function isAplosAuthData(value: unknown): value is AplosAuthData {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).expires === "string" &&
    typeof (value as Record<string, unknown>).token === "string"
  );
}

// ---------------------------------------------------------------------------
// Partner verification (GET /partners/verify) — confirmed via
// help.aplos.com "API Calls: Partners"
// ---------------------------------------------------------------------------

export interface AplosPartnerVerification {
  aplos_account_id: string;
  authorized: boolean;
}

export function isAplosPartnerVerification(value: unknown): value is AplosPartnerVerification {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).aplos_account_id === "string" &&
    typeof (value as Record<string, unknown>).authorized === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Accounts (GET /accounts, /accounts/:accountNumber) — READ ONLY per docs
// (POST/PUT/DELETE confirmed to return 405 "not available"). Confirmed via
// help.aplos.com "API Calls: Accounts".
// ---------------------------------------------------------------------------

export type AplosAccountCategory = "asset" | "liability" | "equity" | "income" | "expense";

export interface AplosAccount {
  account_number: number;
  name: string;
  category: AplosAccountCategory;
  account_group?: { id: number; name: string; seq?: number };
  is_enabled: boolean;
  type: string;
  activity?: string;
}

export function isAplosAccount(value: unknown): value is AplosAccount {
  const v = value as Record<string, unknown>;
  return (
    !!v &&
    typeof v === "object" &&
    typeof v.account_number === "number" &&
    typeof v.name === "string" &&
    typeof v.is_enabled === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Funds (GET /funds, /funds/:fundId) — READ ONLY per docs. Confirmed via
// help.aplos.com "API Calls: Funds". Note: a Fund is distinct from a
// Purpose — a Contribution line references a Purpose, and each Purpose
// itself carries a reference back to exactly one Fund.
// ---------------------------------------------------------------------------

export interface AplosFund {
  id: number;
  name: string;
  balance_account_name?: string;
  balance_account_number?: number;
}

export function isAplosFund(value: unknown): value is AplosFund {
  const v = value as Record<string, unknown>;
  return !!v && typeof v === "object" && typeof v.id === "number" && typeof v.name === "string";
}

// ---------------------------------------------------------------------------
// Purposes (GET/POST/PUT/DELETE /purposes) — confirmed via
// help.aplos.com "API Calls: Purposes". This is what a WGC Fund maps to
// (AplosPurposeMapping.aplosPurposeId), not AplosFund directly.
// ---------------------------------------------------------------------------

export interface AplosPurpose {
  id: number;
  name: string;
  description?: string;
  is_enabled: boolean;
  seq?: number;
  income_account?: { account_number: number; name: string };
  fund?: { id: number; name: string };
}

export function isAplosPurpose(value: unknown): value is AplosPurpose {
  const v = value as Record<string, unknown>;
  return !!v && typeof v === "object" && typeof v.id === "number" && typeof v.name === "string" && typeof v.is_enabled === "boolean";
}

// ---------------------------------------------------------------------------
// Contributions (GET/POST/PUT/DELETE /contributions) — confirmed via
// help.aplos.com "API Calls: Contributions". NOT wired to any live call in
// Checkpoint 2 — reference types only, for AplosContributionBuilder in a
// future checkpoint.
//
// Confirmed, load-bearing observations from the real docs (do not assume
// otherwise without re-checking):
//   - `amount` and `expense_amount` are DECIMAL DOLLARS, not integer cents
//     (example: "amount": 100 for a $100 contribution, "expense_amount": 3.2
//     for a $3.20 fee). Converting from this codebase's integer-cents
//     source-of-truth fields must happen via exact decimal string
//     formatting at the API boundary only, never float arithmetic.
//   - `is_ntd` / `ntd_amount` ("non tax deductible") is the field for a
//     goods-and-services value — maps to Payment.goodsServicesProvided /
//     goodsServicesFairMarketValueCents.
//   - There is NO external-reference or idempotency field anywhere in this
//     payload, and no documented way to search created contributions by an
//     external/WGC reference — confirmed absent, not overlooked. See
//     docs/integrations/aplos.md "Open Items" for how this constrains the
//     idempotency design in a future checkpoint.
//   - Aplos auto-creates its own accounting deposit transaction
//     (deposit_transaction_id) tied to the contribution — WGC never posts
//     accounting entries directly, only the contribution.
// ---------------------------------------------------------------------------

export interface AplosContributionLineInput {
  contact: {
    id?: number;
    firstname?: string;
    lastname?: string;
    companyname?: string;
    type?: "individual" | "company";
    email?: string;
  };
  purpose: { id: number };
  note?: string;
  amount: number; // decimal dollars
  expense_amount?: number; // decimal dollars
  is_ntd?: boolean;
  ntd_amount?: number; // decimal dollars
}

export interface AplosContributionInput {
  name: string;
  description?: string;
  source_url?: string;
  date: string; // yyyy-MM-dd
  deposit_account: { account_number: number };
  expense_account?: { account_number: number };
  expense_contact?: { name: string } | { id: number };
  lines: AplosContributionLineInput[];
}

export interface AplosContributionLine {
  id: number;
  contribution_id: number;
  contact: { id: number; firstname?: string; lastname?: string; type?: string };
  purpose: { id: number; name: string };
  note?: string;
  amount: number;
  is_ntd: boolean;
  ntd_amount: number;
  expense_amount?: number;
}

export interface AplosContribution {
  id: number;
  name: string;
  description?: string;
  date: string;
  source_url?: string;
  lines: AplosContributionLine[];
  created: string;
  modified?: string;
  deposit_transaction_id?: number;
  deposit_account?: { account_number: number; name: string };
  expense_account?: { account_number: number; name: string };
  expense_contact?: { id: number; name: string };
  amount: number;
  expense_amount?: number;
}

export function isAplosContribution(value: unknown): value is AplosContribution {
  const v = value as Record<string, unknown>;
  return !!v && typeof v === "object" && typeof v.id === "number" && typeof v.amount === "number" && Array.isArray(v.lines);
}
