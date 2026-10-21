/**
 * Validation + Finix mapping for the extra "Update Data" corrections a merchant can make on the secure
 * update page (website, business phone, principal SSN and residential address, nonprofit ownership).
 *
 * Field names are Finix's Identity entity fields (confirmed in docs.finix.com Update an Identity):
 * entity.url, entity.business_phone, entity.tax_id, entity.personal_address, entity.principal_percentage_ownership.
 * In WGC's own onboarding the principal's data lives on the seller Identity's entity (not an associated
 * identity), so these are all updated with one PUT /identities/{id}.
 *
 * The SSN is only ever validated and forwarded to Finix. It is never stored, logged or echoed back, and
 * the field list returned for audit/admin emails carries names only, never values.
 */

export interface UpdateRequestFieldInput {
  website?: string | null;
  businessPhone?: string | null;
  principalSsn?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  removeOwnership?: boolean;
}

export interface ParsedUpdateFields {
  /** Entity fields to PUT to the Finix Identity. */
  entity: Record<string, unknown>;
  /** Human-readable names of what changed (never values) for the audit/admin email. */
  fieldNames: string[];
  /** A single user-facing validation message, or null when everything is valid. */
  error: string | null;
}

const trim = (v: string | null | undefined) => (v ?? "").trim();

export function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** US phone to 10 digits (drops a leading country code 1); null when it isn't a plausible US number. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : null;
}

/** SSN to 9 digits; rejects the obviously invalid ranges SSA never issues. */
export function normalizeSsn(raw: string): string | null {
  // Only SSN shapes (123-45-6789 or 9 plain digits). An EIN-shaped value (12-3456789) is rejected on purpose:
  // putting the organization's EIN in the principal's SSN field is exactly what Finix flagged.
  if (!/^\d{3}[-\s]?\d{2}[-\s]?\d{4}$/.test(raw.trim())) return null;
  const d = raw.replace(/[\s-]/g, "");
  const area = d.slice(0, 3);
  if (area === "000" || area === "666" || area[0] === "9") return null;
  if (d.slice(3, 5) === "00" || d.slice(5) === "0000") return null;
  return d;
}

export function parseUpdateRequestFields(input: UpdateRequestFieldInput): ParsedUpdateFields {
  const entity: Record<string, unknown> = {};
  const fieldNames: string[] = [];
  const fail = (error: string): ParsedUpdateFields => ({ entity: {}, fieldNames: [], error });

  const website = trim(input.website);
  if (website) {
    const url = normalizeWebsite(website);
    if (!url) return fail("Please enter a valid website address, for example https://yourchurch.org.");
    entity.url = url;
    fieldNames.push("Website");
  }

  const phone = trim(input.businessPhone);
  if (phone) {
    const p = normalizePhone(phone);
    if (!p) return fail("Please enter a valid 10-digit business phone number.");
    entity.business_phone = p;
    fieldNames.push("Business phone");
  }

  const ssn = trim(input.principalSsn);
  if (ssn) {
    const s = normalizeSsn(ssn);
    if (!s) return fail("Please enter a valid 9-digit Social Security Number.");
    entity.tax_id = s;
    fieldNames.push("Principal SSN");
  }

  const line1 = trim(input.addressLine1);
  const line2 = trim(input.addressLine2);
  const city = trim(input.city);
  const state = trim(input.state).toUpperCase();
  const zip = trim(input.postalCode);
  if (line1 || city || state || zip) {
    if (!line1 || !city || !state || !zip) return fail("Please complete the residential address (street, city, state and ZIP).");
    if (!/^[A-Z]{2}$/.test(state)) return fail("Please enter the state as a 2-letter code, for example MO.");
    if (!/^\d{5}(-\d{4})?$/.test(zip)) return fail("Please enter a valid 5-digit ZIP code.");
    entity.personal_address = { line1, ...(line2 ? { line2 } : {}), city, region: state, postal_code: zip, country: "USA" };
    fieldNames.push("Principal residential address");
  }

  if (input.removeOwnership) {
    // Nonprofits have no owners; Finix's field is nullable.
    entity.principal_percentage_ownership = null;
    fieldNames.push("Ownership percentage removed");
  }

  return { entity, fieldNames, error: null };
}

/** Strips anything that looks like an SSN out of an error message before it can be logged or returned. */
export function redactSsnLike(message: string): string {
  return message.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[REDACTED]");
}

export interface BankAccountInput {
  holderName?: string | null;
  accountType?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  accountNumberConfirm?: string | null;
}

export interface ParsedBankAccount {
  /** Payload for Finix's POST /payment_instruments (identity is added by the caller). Null when no bank fields were given. */
  payload: { type: "BANK_ACCOUNT"; name: string; account_type: "CHECKING" | "SAVINGS"; bank_code: string; account_number: string } | null;
  last4: string | null;
  error: string | null;
}

/** ABA routing number checksum (3-7-1 weighting). */
export function isValidRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/**
 * Validates a replacement payout bank account. All four fields are required together; the account number must be
 * entered twice. Only the last 4 digits ever leave this function for storage; the full numbers go to Finix and nowhere else.
 */
export function parseBankAccount(input: BankAccountInput): ParsedBankAccount {
  const holder = trim(input.holderName);
  const type = trim(input.accountType).toUpperCase();
  const routing = trim(input.routingNumber).replace(/\s/g, "");
  const account = trim(input.accountNumber).replace(/\s/g, "");
  const confirm = trim(input.accountNumberConfirm).replace(/\s/g, "");
  const none = { payload: null, last4: null, error: null };
  if (!holder && !type && !routing && !account && !confirm) return none;

  const fail = (error: string): ParsedBankAccount => ({ payload: null, last4: null, error });
  if (!holder || !type || !routing || !account || !confirm) return fail("Please complete every bank account field (name, account type, routing number and the account number twice).");
  if (holder.length < 2 || holder.length > 100) return fail("Please enter the name on the bank account.");
  if (type !== "CHECKING" && type !== "SAVINGS") return fail("Please choose checking or savings.");
  if (!isValidRoutingNumber(routing)) return fail("That routing number doesn't look right. It should be 9 digits; please check it against your check or bank statement.");
  if (!/^\d{4,17}$/.test(account)) return fail("Please enter the account number using digits only (4 to 17 digits).");
  if (account !== confirm) return fail("The two account numbers don't match.");
  return { payload: { type: "BANK_ACCOUNT", name: holder, account_type: type, bank_code: routing, account_number: account }, last4: account.slice(-4), error: null };
}

/** Removes long digit runs (account/routing/SSN numbers) from a message before it can be logged or returned. */
export function redactLongDigits(message: string): string {
  return message.replace(/\d[\d-]{5,}\d/g, "[REDACTED]");
}
