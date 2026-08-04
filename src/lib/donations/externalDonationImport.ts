import { createHash } from "crypto";
import { parseCsv } from "@/lib/donors/csvImport";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { isExternalPaymentMethod, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";

export const IMPORT_ROW_CAP = 2000;
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_IMPORT_MIME_TYPES = new Set(["text/csv", "application/vnd.ms-excel", "text/plain"]);

/** Canonical destination field keys a CSV column can be mapped to. */
export const IMPORT_FIELD_KEYS = [
  "donorFirstName",
  "donorLastName",
  "donorEmail",
  "donorPhone",
  "donorAddress",
  "amount",
  "donationDate",
  "paymentMethod",
  "fund",
  "campaign",
  "referenceNumber",
  "taxDeductible",
  "deductibleAmount",
  "goodsOrServicesProvided",
  "goodsOrServicesValue",
  "anonymous",
  "notes",
  "sendReceipt",
] as const;
export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const REQUIRED_IMPORT_FIELDS: readonly ImportFieldKey[] = ["amount", "donationDate"];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  donorFirstName: "Donor First Name",
  donorLastName: "Donor Last Name",
  donorEmail: "Donor Email",
  donorPhone: "Donor Phone",
  donorAddress: "Donor Address",
  amount: "Amount",
  donationDate: "Donation Date",
  paymentMethod: "Payment Method",
  fund: "Fund",
  campaign: "Campaign",
  referenceNumber: "Reference Number",
  taxDeductible: "Tax Deductible",
  deductibleAmount: "Deductible Amount",
  goodsOrServicesProvided: "Goods or Services Provided",
  goodsOrServicesValue: "Goods or Services Value",
  anonymous: "Anonymous",
  notes: "Notes",
  sendReceipt: "Send Receipt",
};

/** Common alternate spellings auto-mapped to a canonical field, per spec §3 Step 2. */
export const IMPORT_HEADER_ALIASES: Record<string, ImportFieldKey> = {
  donor_first_name: "donorFirstName",
  "first name": "donorFirstName",
  firstname: "donorFirstName",
  donor_last_name: "donorLastName",
  "last name": "donorLastName",
  lastname: "donorLastName",
  donor_email: "donorEmail",
  email: "donorEmail",
  "email address": "donorEmail",
  donor_phone: "donorPhone",
  phone: "donorPhone",
  "phone number": "donorPhone",
  donor_address: "donorAddress",
  address: "donorAddress",
  amount: "amount",
  "gift amount": "amount",
  "donation amount": "amount",
  donation_date: "donationDate",
  date: "donationDate",
  "gift date": "donationDate",
  payment_method: "paymentMethod",
  method: "paymentMethod",
  "payment type": "paymentMethod",
  fund: "fund",
  purpose: "fund",
  designation: "fund",
  campaign: "campaign",
  reference_number: "referenceNumber",
  "check number": "referenceNumber",
  "transaction id": "referenceNumber",
  reference: "referenceNumber",
  tax_deductible: "taxDeductible",
  "tax deductible": "taxDeductible",
  deductible_amount: "deductibleAmount",
  "deductible amount": "deductibleAmount",
  goods_or_services_provided: "goodsOrServicesProvided",
  "goods or services provided": "goodsOrServicesProvided",
  goods_or_services_value: "goodsOrServicesValue",
  "goods or services value": "goodsOrServicesValue",
  anonymous: "anonymous",
  notes: "notes",
  send_receipt: "sendReceipt",
  "send receipt": "sendReceipt",
};

export type ColumnMapping = Record<string, ImportFieldKey | null>; // rawHeader -> field key or null (skip)

/** Auto-suggests a mapping from raw CSV headers using IMPORT_HEADER_ALIASES. Unrecognized headers map to null (skip). */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const key = IMPORT_HEADER_ALIASES[header.trim().toLowerCase()];
    mapping[header] = key ?? null;
  }
  return mapping;
}

/** Detects the same destination field mapped from more than one source column. */
export function findDuplicateMappings(mapping: ColumnMapping): ImportFieldKey[] {
  const counts = new Map<ImportFieldKey, number>();
  for (const key of Object.values(mapping)) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

export interface MappedImportRow {
  donorFirstName: string | null;
  donorLastName: string | null;
  donorEmail: string | null;
  donorPhone: string | null;
  donorAddress: string | null;
  amount: string | null;
  donationDate: string | null;
  paymentMethod: string | null;
  fund: string | null;
  campaign: string | null;
  referenceNumber: string | null;
  taxDeductible: string | null;
  deductibleAmount: string | null;
  goodsOrServicesProvided: string | null;
  goodsOrServicesValue: string | null;
  anonymous: string | null;
  notes: string | null;
  sendReceipt: string | null;
}

function clean(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapRow(headers: string[], row: string[], mapping: ColumnMapping): MappedImportRow {
  const result: MappedImportRow = {
    donorFirstName: null,
    donorLastName: null,
    donorEmail: null,
    donorPhone: null,
    donorAddress: null,
    amount: null,
    donationDate: null,
    paymentMethod: null,
    fund: null,
    campaign: null,
    referenceNumber: null,
    taxDeductible: null,
    deductibleAmount: null,
    goodsOrServicesProvided: null,
    goodsOrServicesValue: null,
    anonymous: null,
    notes: null,
    sendReceipt: null,
  };
  headers.forEach((header, i) => {
    const key = mapping[header];
    if (!key) return;
    result[key] = clean(row[i]);
  });
  return result;
}

/** Accepts "yes"/"no"/"true"/"false"/"1"/"0"/"y"/"n" case-insensitively; null/blank -> undefined (unspecified, caller applies a default). Anything else is invalid. */
export function parseYesNo(value: string | null): { value: boolean | undefined; valid: boolean } {
  if (!value) return { value: undefined, valid: true };
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return { value: true, valid: true };
  if (["no", "n", "false", "0"].includes(v)) return { value: false, valid: true };
  return { value: undefined, valid: false };
}

/** Parses a currency-ish string ("$1,234.56", "1234.56", "1234") into integer cents. Returns null if unparseable. */
export function parseAmountToCents(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = parseFloat(cleaned);
  if (Number.isNaN(amount)) return null;
  return Math.round(amount * 100);
}

/** Parses a date string in common formats (ISO, MM/DD/YYYY, M/D/YY) into a Date, or null if unparseable/invalid. */
export function parseImportDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  // MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const date = new Date(Date.UTC(year, parseInt(m, 10) - 1, parseInt(d, 10)));
    if (date.getUTCMonth() !== parseInt(m, 10) - 1) return null; // rolled over -> invalid day
    return date;
  }
  // ISO or other Date-parseable formats
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/** Maps a free-text payment method label to a known ExternalPaymentMethod, falling back to OTHER. */
export function resolvePaymentMethod(value: string | null): { method: ExternalPaymentMethod; otherName: string | null; recognized: boolean } {
  if (!value) return { method: "CASH", otherName: null, recognized: true }; // default when omitted
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (isExternalPaymentMethod(upper)) return { method: upper as ExternalPaymentMethod, otherName: null, recognized: true };
  const aliasMap: Record<string, ExternalPaymentMethod> = {
    CHECK: "CHECK",
    CHEQUE: "CHECK",
    CASHAPP: "CASH_APP",
    CASH_APP: "CASH_APP",
    ZELLE: "ZELLE",
    VENMO: "VENMO",
    PAYPAL: "PAYPAL",
    ACH: "BANK_TRANSFER",
    WIRE: "BANK_TRANSFER",
    BANK_TRANSFER: "BANK_TRANSFER",
    CARD: "EXTERNAL_CARD_TERMINAL",
    CREDIT_CARD: "EXTERNAL_CARD_TERMINAL",
    MONEY_ORDER: "MONEY_ORDER",
  };
  if (aliasMap[upper]) return { method: aliasMap[upper], otherName: null, recognized: true };
  return { method: "OTHER", otherName: value.trim().slice(0, 100), recognized: false };
}

/** Deterministic fingerprint for retry-safe re-import: same organization + donor identifier + amount + date +
 * reference number always hashes the same, so re-uploading the same file is detectable — but this is only ever
 * used as a *signal* surfaced to the user (see §4 of the spec), never a hard uniqueness constraint, so a
 * genuinely repeated gift is never silently blocked. */
export function computeRowFingerprint(
  churchId: string,
  input: { donorEmail: string | null; donorFirstName: string | null; donorLastName: string | null; amountCents: number | null; donationDate: string | null; referenceNumber: string | null }
): string {
  const donorKey = (input.donorEmail || `${input.donorFirstName || ""} ${input.donorLastName || ""}`).trim().toLowerCase();
  const parts = [churchId, donorKey, String(input.amountCents ?? ""), input.donationDate || "", (input.referenceNumber || "").trim().toLowerCase()];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export interface ImportRowValidation {
  errors: string[];
  warnings: string[];
  amountCents: number | null;
  donationDate: Date | null;
  paymentMethod: ExternalPaymentMethod | null;
  otherPaymentMethodName: string | null;
  isTaxDeductible: boolean;
  deductibleAmountCents: number | null;
  goodsOrServicesProvided: boolean;
  goodsOrServicesValueCents: number | null;
  isAnonymous: boolean;
  sendReceipt: boolean;
  donorEmail: string | null;
  donorName: string | null;
}

export function validateMappedRow(row: MappedImportRow): ImportRowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const amountCents = parseAmountToCents(row.amount);
  if (row.amount == null) {
    errors.push("Missing donation amount");
  } else if (amountCents == null) {
    errors.push("Invalid amount");
  } else if (amountCents <= 0) {
    errors.push("Amount must be greater than zero");
  }

  const donationDate = parseImportDate(row.donationDate);
  if (row.donationDate == null) {
    errors.push("Missing donation date");
  } else if (!donationDate) {
    errors.push("Invalid date");
  } else if (donationDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    warnings.push("Donation date is in the future");
  }

  const donorName = [row.donorFirstName, row.donorLastName].filter(Boolean).join(" ").trim() || null;
  if (!donorName && !row.donorEmail && !row.donorPhone) {
    errors.push("Provide a donor name, email, or phone");
  }
  if (row.donorEmail && !isValidEmail(row.donorEmail)) {
    errors.push("Invalid donor email address");
  }
  if (row.donorPhone && !normalizeUSPhone(row.donorPhone)) {
    warnings.push("Donor phone number could not be recognized as a valid U.S. number and will be ignored");
  }

  const { method: paymentMethod, otherName: otherPaymentMethodName, recognized } = resolvePaymentMethod(row.paymentMethod);
  if (!recognized) {
    warnings.push(`Unrecognized payment method "${row.paymentMethod}" — imported as Other`);
  }

  const taxDeductibleParsed = parseYesNo(row.taxDeductible);
  if (!taxDeductibleParsed.valid) errors.push('Invalid value for "Tax Deductible" — use yes or no');
  const isTaxDeductible = taxDeductibleParsed.value ?? true;

  const deductibleAmountCents = row.deductibleAmount != null ? parseAmountToCents(row.deductibleAmount) : null;
  if (row.deductibleAmount != null && deductibleAmountCents == null) {
    errors.push("Invalid deductible amount");
  } else if (deductibleAmountCents != null && amountCents != null && deductibleAmountCents > amountCents) {
    errors.push("Deductible amount is greater than the donation amount");
  }

  const goodsProvidedParsed = parseYesNo(row.goodsOrServicesProvided);
  if (!goodsProvidedParsed.valid) errors.push('Invalid value for "Goods or Services Provided" — use yes or no');
  const goodsOrServicesProvided = goodsProvidedParsed.value ?? false;

  const goodsOrServicesValueCents = row.goodsOrServicesValue != null ? parseAmountToCents(row.goodsOrServicesValue) : null;
  if (row.goodsOrServicesValue != null && goodsOrServicesValueCents == null) {
    errors.push("Invalid goods or services value");
  } else if (goodsOrServicesValueCents != null && amountCents != null && goodsOrServicesValueCents > amountCents) {
    errors.push("Goods or services value is greater than the donation amount");
  }

  const anonymousParsed = parseYesNo(row.anonymous);
  if (!anonymousParsed.valid) errors.push('Invalid value for "Anonymous" — use yes or no');
  const isAnonymous = anonymousParsed.value ?? false;
  if (isAnonymous && (row.donorEmail || donorName)) {
    warnings.push("Row marked Anonymous — donor name/email will not be linked");
  }

  const sendReceiptParsed = parseYesNo(row.sendReceipt);
  if (!sendReceiptParsed.valid) errors.push('Invalid value for "Send Receipt" — use yes or no');
  const sendReceipt = sendReceiptParsed.value ?? false;

  return {
    errors,
    warnings,
    amountCents,
    donationDate,
    paymentMethod: errors.length === 0 || paymentMethod ? paymentMethod : null,
    otherPaymentMethodName,
    isTaxDeductible,
    deductibleAmountCents,
    goodsOrServicesProvided,
    goodsOrServicesValueCents,
    isAnonymous,
    sendReceipt,
    donorEmail: row.donorEmail,
    donorName,
  };
}

export { parseCsv };
