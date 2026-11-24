import { createHash } from "crypto";
import { parseCsv } from "@/lib/donors/csvImport";
import { SUPPORTED_SUBSCRIPTION_FREQUENCIES, type SubscriptionFrequency } from "@/lib/subscriptions/subscriptionStatus";
import { MIGRATION_ROW_CAP } from "@/lib/migrations/types";
export { SCHEDULE_TEMPLATE_CSV, MAPPING_TEMPLATE_CSV } from "@/lib/migrations/recurringImportText";

/**
 * Recurring-gift import (moving a merchant's recurring donors from another giving platform, first case
 * Continue to Give). Pure parsing and validation only: nothing here touches the database or Finix, so the
 * dry-run preview can never create anything. The run itself lives in recurringImportRun.ts.
 *
 * Two files come in:
 *  - the MAPPING file Finix returns after it imports the saved cards and bank accounts: the platform's own
 *    customer ID and token ID next to the new Finix identity_id and instrument_id (PI...);
 *  - the SCHEDULE file from the merchant or the old platform: one row per recurring gift (amount, frequency,
 *    next charge date, fund). It carries no card or bank numbers.
 */

export const RECURRING_ENTITY_TYPE = "RECURRING_SUBSCRIPTION";
export const RECURRING_SOURCE_SYSTEM = "CONTINUE_TO_GIVE";

export const MIN_AMOUNT_CENTS = 100;
export const MAX_AMOUNT_CENTS = 5_000_000; // $50,000 per charge; larger needs a human to look
export const MAX_DAYS_AHEAD = 400;

export interface MappingRow {
  externalCustomerId: string;
  originalTokenId: string | null;
  finixIdentityId: string;
  finixInstrumentId: string;
  /** Finix's `is_expired`: the card cannot be charged until it is updated. */
  expired?: boolean;
  /** Finix's `successful` was false or the IDs are blank: the card was not imported, and why. */
  failedReason?: string;
}

export interface ScheduleRow {
  rowNumber: number;
  externalCustomerId: string;
  originalTokenId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  amountCents: number | null;
  amountRaw: string;
  frequency: SubscriptionFrequency | null;
  frequencyRaw: string;
  nextChargeDate: string | null; // YYYY-MM-DD
  nextChargeRaw: string;
  fundName: string | null;
  startDate: string | null;
  endDate: string | null;
  consentDate: string | null;
}

export type RowStatus = "VALID" | "WARNING" | "INVALID" | "DUPLICATE";

export interface RecurringPreviewRow {
  rowNumber: number;
  status: RowStatus;
  messages: string[];
  externalCustomerId: string;
  originalTokenId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  amountCents: number | null;
  frequency: SubscriptionFrequency | null;
  nextChargeDate: string | null;
  /** Days from the run date to the first WGC charge; becomes the Finix trial length. */
  trialDays: number | null;
  fundName: string | null;
  fundId: string | null;
  finixIdentityId: string | null;
  finixInstrumentId: string | null;
  fingerprint: string;
}

export interface RecurringPreview {
  rows: RecurringPreviewRow[];
  counts: Record<RowStatus, number> & { total: number };
  /** Fund names in the schedule file that have no match yet. */
  unmatchedFunds: string[];
  fileErrors: string[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const MAPPING_ALIASES: Record<"externalCustomerId" | "originalTokenId" | "finixIdentityId" | "finixInstrumentId", string[]> = {
  externalCustomerId: ["external_customer_id", "customer_id", "external_id", "donor_id"],
  originalTokenId: ["external_token_id", "original_token_id", "token_id", "original_token", "payment_method_id", "original_payment_method_id"],
  finixIdentityId: ["identity_id", "finix_identity_id"],
  finixInstrumentId: ["instrument_id", "finix_instrument_id", "payment_instrument_id"],
};

const SCHEDULE_ALIASES = {
  externalCustomerId: ["external_customer_id", "customer_id", "external_id", "donor_id"],
  originalTokenId: ["external_token_id", "original_token_id", "token_id", "original_token", "payment_method_id"],
  donorName: ["donor_name", "name", "customer_name", "full_name"],
  donorEmail: ["donor_email", "email", "customer_email"],
  amount: ["amount", "gift_amount", "recurring_amount", "amount_dollars"],
  amountCents: ["amount_cents"],
  frequency: ["frequency", "interval", "billing_interval", "schedule"],
  nextChargeDate: ["next_charge_date", "next_payment_date", "next_billing_date", "next_gift_date", "next_date"],
  fundName: ["fund", "fund_name", "designation", "category"],
  startDate: ["start_date", "created_date", "first_gift_date"],
  endDate: ["end_date", "stop_date"],
  consentDate: ["consent_date", "authorized_date", "authorization_date"],
} as const;

function headerIndex(headers: string[], aliases: readonly string[]): number {
  const normalized = headers.map(norm);
  for (const alias of aliases) {
    const i = normalized.indexOf(alias);
    if (i !== -1) return i;
  }
  return -1;
}

const cell = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i].trim() : "");

export function parseMappingCsv(text: string): { rows: MappingRow[]; errors: string[] } {
  const errors: string[] = [];
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { rows: [], errors: ["The mapping file is empty or has no data rows."] };
  const headers = table[0];
  const idx = {
    externalCustomerId: headerIndex(headers, MAPPING_ALIASES.externalCustomerId),
    originalTokenId: headerIndex(headers, MAPPING_ALIASES.originalTokenId),
    finixIdentityId: headerIndex(headers, MAPPING_ALIASES.finixIdentityId),
    finixInstrumentId: headerIndex(headers, MAPPING_ALIASES.finixInstrumentId),
    successful: headerIndex(headers, ["successful", "success"]),
    isExpired: headerIndex(headers, ["is_expired", "expired"]),
    errorMsg: headerIndex(headers, ["error_msg", "error_message", "error"]),
  };
  if (idx.externalCustomerId === -1) errors.push("The mapping file needs a customer ID column (external_customer_id).");
  if (idx.finixIdentityId === -1) errors.push("The mapping file needs an identity ID column (finix_identity_id or identity_id).");
  if (idx.finixInstrumentId === -1) errors.push("The mapping file needs an instrument ID column (finix_instrument_id or instrument_id).");
  if (errors.length > 0) return { rows: [], errors };

  const truthy = (v: string) => /^(true|t|yes|y|1)$/i.test(v.trim());
  const rows: MappingRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const externalCustomerId = cell(row, idx.externalCustomerId);
    if (!externalCustomerId) continue;
    const finixIdentityId = cell(row, idx.finixIdentityId);
    const finixInstrumentId = cell(row, idx.finixInstrumentId);
    const successfulRaw = cell(row, idx.successful);
    const notSuccessful = idx.successful !== -1 && successfulRaw !== "" && !truthy(successfulRaw);
    const failedReason = notSuccessful || !finixIdentityId || !finixInstrumentId ? cell(row, idx.errorMsg) || "Finix did not import this card." : undefined;
    rows.push({
      externalCustomerId,
      originalTokenId: cell(row, idx.originalTokenId) || null,
      finixIdentityId,
      finixInstrumentId,
      expired: idx.isExpired !== -1 && truthy(cell(row, idx.isExpired)) ? true : undefined,
      failedReason,
    });
  }
  return { rows, errors };
}

/** Accepts YYYY-MM-DD, M/D/YYYY and M/D/YY. Returns YYYY-MM-DD or null. Never guesses day/month order. */
export function parseDateString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (match) {
    y = +match[1];
    m = +match[2];
    d = +match[3];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) {
    m = +match[1];
    d = +match[2];
    y = +match[3];
    if (y < 100) y += 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const FREQUENCY_WORDS: Record<string, SubscriptionFrequency> = {
  weekly: "WEEKLY",
  week: "WEEKLY",
  monthly: "MONTHLY",
  month: "MONTHLY",
  quarterly: "QUARTERLY",
  quarter: "QUARTERLY",
  yearly: "YEARLY",
  annually: "YEARLY",
  annual: "YEARLY",
  year: "YEARLY",
};

export function parseFrequency(raw: string): SubscriptionFrequency | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (FREQUENCY_WORDS[v]) return FREQUENCY_WORDS[v];
  const upper = v.toUpperCase();
  return (SUPPORTED_SUBSCRIPTION_FREQUENCIES as readonly string[]).includes(upper) ? (upper as SubscriptionFrequency) : null;
}

/** "25", "25.00", "$1,250.50" -> cents. Rejects anything with more than two decimals or stray text. */
export function parseAmountToCents(raw: string): number | null {
  const v = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(parseFloat(v) * 100);
}

export function parseScheduleCsv(text: string): { rows: ScheduleRow[]; errors: string[]; truncated: boolean } {
  const errors: string[] = [];
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { rows: [], errors: ["The schedule file is empty or has no data rows."], truncated: false };
  const headers = table[0];
  const idx = {
    externalCustomerId: headerIndex(headers, SCHEDULE_ALIASES.externalCustomerId),
    originalTokenId: headerIndex(headers, SCHEDULE_ALIASES.originalTokenId),
    donorName: headerIndex(headers, SCHEDULE_ALIASES.donorName),
    donorEmail: headerIndex(headers, SCHEDULE_ALIASES.donorEmail),
    amount: headerIndex(headers, SCHEDULE_ALIASES.amount),
    amountCents: headerIndex(headers, SCHEDULE_ALIASES.amountCents),
    frequency: headerIndex(headers, SCHEDULE_ALIASES.frequency),
    nextChargeDate: headerIndex(headers, SCHEDULE_ALIASES.nextChargeDate),
    fundName: headerIndex(headers, SCHEDULE_ALIASES.fundName),
    startDate: headerIndex(headers, SCHEDULE_ALIASES.startDate),
    endDate: headerIndex(headers, SCHEDULE_ALIASES.endDate),
    consentDate: headerIndex(headers, SCHEDULE_ALIASES.consentDate),
  };
  if (idx.externalCustomerId === -1) errors.push("The schedule file needs a customer ID column (external_customer_id).");
  if (idx.amount === -1 && idx.amountCents === -1) errors.push("The schedule file needs an amount column.");
  if (idx.frequency === -1) errors.push("The schedule file needs a frequency column.");
  if (idx.nextChargeDate === -1) errors.push("The schedule file needs a next_charge_date column.");
  if (errors.length > 0) return { rows: [], errors, truncated: false };

  const dataRows = table.slice(1);
  const truncated = dataRows.length > MIGRATION_ROW_CAP;
  const rows: ScheduleRow[] = [];
  dataRows.slice(0, MIGRATION_ROW_CAP).forEach((row, i) => {
    const amountRaw = idx.amountCents !== -1 && cell(row, idx.amountCents) ? cell(row, idx.amountCents) : cell(row, idx.amount);
    const amountCents = idx.amountCents !== -1 && cell(row, idx.amountCents) ? (/^\d+$/.test(amountRaw) ? Number(amountRaw) : null) : parseAmountToCents(amountRaw);
    const frequencyRaw = cell(row, idx.frequency);
    const nextChargeRaw = cell(row, idx.nextChargeDate);
    rows.push({
      rowNumber: i + 2, // spreadsheet row, header is row 1
      externalCustomerId: cell(row, idx.externalCustomerId),
      originalTokenId: cell(row, idx.originalTokenId) || null,
      donorName: cell(row, idx.donorName) || null,
      donorEmail: cell(row, idx.donorEmail).toLowerCase() || null,
      amountCents,
      amountRaw,
      frequency: parseFrequency(frequencyRaw),
      frequencyRaw,
      nextChargeDate: parseDateString(nextChargeRaw),
      nextChargeRaw,
      fundName: cell(row, idx.fundName) || null,
      startDate: parseDateString(cell(row, idx.startDate)),
      endDate: parseDateString(cell(row, idx.endDate)),
      consentDate: parseDateString(cell(row, idx.consentDate)),
    });
  });
  return { rows, errors, truncated };
}

// ---------------------------------------------------------------------------------------------------------------
// Validation

export function recurringFingerprint(churchId: string, row: Pick<ScheduleRow, "externalCustomerId" | "originalTokenId" | "amountCents" | "frequency">): string {
  return createHash("sha256")
    .update([churchId, RECURRING_ENTITY_TYPE, row.externalCustomerId, row.originalTokenId ?? "", row.amountCents ?? "", row.frequency ?? ""].map((p) => String(p).trim().toLowerCase()).join("|"))
    .digest("hex");
}

/** Whole days from `today` to `target`, both as YYYY-MM-DD in UTC. */
export function daysBetween(today: string, target: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${target}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface ValidateInput {
  churchId: string;
  mapping: MappingRow[];
  schedule: ScheduleRow[];
  /** Platform fund name (lowercase) -> WGC fund id. A fund name not in here is reported as unmatched. */
  fundMap: Record<string, string>;
  /** Fingerprints already imported for this organization (any job). */
  alreadyImported: Set<string>;
  today?: string;
}

export function validateRecurringImport(input: ValidateInput): RecurringPreview {
  const today = input.today ?? todayUtc();
  const rows: RecurringPreviewRow[] = [];
  const unmatched = new Set<string>();

  // customer -> mappings
  const byCustomer = new Map<string, MappingRow[]>();
  for (const m of input.mapping) {
    const list = byCustomer.get(m.externalCustomerId) ?? [];
    list.push(m);
    byCustomer.set(m.externalCustomerId, list);
  }
  const seenInFile = new Set<string>();
  const instrumentTaken = new Map<string, number>(); // instrument + amount + frequency -> first row, to catch a copied line

  for (const s of input.schedule) {
    const messages: string[] = [];
    let status = "VALID" as RowStatus;
    const bad = (msg: string) => {
      messages.push(msg);
      status = "INVALID";
    };
    const warn = (msg: string) => {
      messages.push(msg);
      if (status === "VALID") status = "WARNING";
    };

    if (!s.externalCustomerId) bad("Customer ID is missing.");

    // Which saved card or bank account is this gift on?
    let mapped: MappingRow | null = null;
    if (s.externalCustomerId) {
      const candidates = byCustomer.get(s.externalCustomerId) ?? [];
      if (candidates.length === 0) bad("No match in the mapping file for this customer ID, so there is no imported card or bank account.");
      else if (s.originalTokenId) {
        mapped = candidates.find((c) => c.originalTokenId === s.originalTokenId) ?? null;
        if (!mapped) bad("The token ID on this row is not in the mapping file for this customer.");
      } else if (candidates.length === 1) {
        mapped = candidates[0];
      } else {
        bad("This customer has more than one saved card or bank account, and the row does not say which. Add the token ID column.");
      }
    }

    if (mapped?.failedReason) bad(`Finix could not import this card: ${mapped.failedReason}`);
    else if (mapped?.expired) bad("Finix reports this card is expired. It cannot be charged until the card is updated.");

    if (s.amountCents == null) bad(`Amount "${s.amountRaw}" is not a valid dollar amount.`);
    else if (s.amountCents < MIN_AMOUNT_CENTS) bad("Amount is below the $1.00 minimum.");
    else if (s.amountCents > MAX_AMOUNT_CENTS) bad("Amount is above $50,000; check it and split or approve it by hand.");

    if (!s.frequency) bad(`Frequency "${s.frequencyRaw}" is not supported. Use weekly, monthly, quarterly or yearly.`);

    let trialDays: number | null = null;
    if (!s.nextChargeDate) bad(`Next charge date "${s.nextChargeRaw}" is not a valid date (use YYYY-MM-DD or M/D/YYYY).`);
    else {
      const days = daysBetween(today, s.nextChargeDate);
      if (days < 1) bad("Next charge date must be at least tomorrow, so no donor is charged before the move.");
      else if (days > MAX_DAYS_AHEAD) bad(`Next charge date is more than ${MAX_DAYS_AHEAD} days away.`);
      else trialDays = days;
    }

    let fundId: string | null = null;
    if (s.fundName) {
      fundId = input.fundMap[s.fundName.trim().toLowerCase()] ?? null;
      if (!fundId) {
        unmatched.add(s.fundName.trim());
        bad(`Fund "${s.fundName}" is not matched to a WGC fund yet.`);
      }
    } else {
      warn("No fund on this row; the gift will have no designation.");
    }

    if (s.endDate) warn("End date is not enforced: Finix keeps charging until the subscription is canceled.");
    if (s.donorEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.donorEmail)) warn("Donor email does not look valid; the donor will be matched from the imported Finix identity instead.");

    const fingerprint = recurringFingerprint(input.churchId, { externalCustomerId: s.externalCustomerId, originalTokenId: mapped?.originalTokenId ?? s.originalTokenId, amountCents: s.amountCents, frequency: s.frequency });
    if (status !== "INVALID") {
      if (input.alreadyImported.has(fingerprint)) {
        status = "DUPLICATE";
        messages.push("Already imported for this organization.");
      } else if (seenInFile.has(fingerprint)) {
        status = "DUPLICATE";
        messages.push("Same customer, card, amount and frequency appears earlier in this file.");
      } else {
        seenInFile.add(fingerprint);
      }
      if (mapped) {
        const key = `${mapped.finixInstrumentId}|${s.amountCents}|${s.frequency}`;
        const first = instrumentTaken.get(key);
        if (first != null && status !== "DUPLICATE") warn(`Same card, amount and frequency as row ${first}: two charges would go out each period.`);
        else if (first == null) instrumentTaken.set(key, s.rowNumber);
      }
    }

    rows.push({
      rowNumber: s.rowNumber,
      status,
      messages,
      externalCustomerId: s.externalCustomerId,
      originalTokenId: mapped?.originalTokenId ?? s.originalTokenId,
      donorName: s.donorName,
      donorEmail: s.donorEmail,
      amountCents: s.amountCents,
      frequency: s.frequency,
      nextChargeDate: s.nextChargeDate,
      trialDays,
      fundName: s.fundName,
      fundId,
      finixIdentityId: mapped?.finixIdentityId ?? null,
      finixInstrumentId: mapped?.finixInstrumentId ?? null,
      fingerprint,
    });
  }

  const counts = { total: rows.length, VALID: 0, WARNING: 0, INVALID: 0, DUPLICATE: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts, unmatchedFunds: [...unmatched].sort(), fileErrors: [], truncated: false };
}

/** Parse both files and validate in one go. File-level problems come back in fileErrors with no rows. */
export function buildRecurringPreview(params: {
  churchId: string;
  scheduleCsv: string;
  mappingCsv: string;
  fundMap: Record<string, string>;
  alreadyImported: Set<string>;
  today?: string;
}): RecurringPreview {
  const mapping = parseMappingCsv(params.mappingCsv);
  const schedule = parseScheduleCsv(params.scheduleCsv);
  const fileErrors = [...mapping.errors.map((e) => `Mapping file: ${e}`), ...schedule.errors.map((e) => `Schedule file: ${e}`)];
  if (fileErrors.length > 0) return { rows: [], counts: { total: 0, VALID: 0, WARNING: 0, INVALID: 0, DUPLICATE: 0 }, unmatchedFunds: [], fileErrors, truncated: false };
  const preview = validateRecurringImport({ churchId: params.churchId, mapping: mapping.rows, schedule: schedule.rows, fundMap: params.fundMap, alreadyImported: params.alreadyImported, today: params.today });
  return { ...preview, truncated: schedule.truncated };
}
