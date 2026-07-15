import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

export const IMPORT_ROW_CAP = 2000;

const HEADER_ALIASES: Record<string, keyof ImportRowInput> = {
  name: "name",
  "donor name": "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  "address line 1": "addressLine1",
  address: "addressLine1",
  "address line 2": "addressLine2",
  city: "city",
  state: "state",
  "postal code": "postalCode",
  zip: "postalCode",
  "zip code": "postalCode",
  country: "country",
  company: "companyName",
  "company name": "companyName",
  organization: "companyName",
};

export interface ImportRowInput {
  name: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  companyName: string | null;
}

export interface ImportRowResult {
  rowNumber: number; // 1-indexed, excludes header row
  input: ImportRowInput;
  status: "valid" | "error" | "duplicate_in_file" | "duplicate_in_org";
  errors: string[];
  normalizedEmail: string | null;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes (""), commas/newlines inside quotes, and CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function clean(value: string | undefined, maxLength = 200): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export function mapCsvRow(headers: string[], row: string[]): ImportRowInput {
  const input: ImportRowInput = {
    name: null,
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    companyName: null,
  };
  headers.forEach((rawHeader, i) => {
    const key = HEADER_ALIASES[rawHeader.trim().toLowerCase()];
    if (!key) return;
    input[key] = clean(row[i], key === "email" ? 320 : key === "phone" ? 30 : 200);
  });
  return input;
}

export function validateImportRowInput(input: ImportRowInput): string[] {
  const errors: string[] = [];
  if (!input.name && !input.companyName) errors.push("Missing donor name");
  if (input.email && !isValidEmail(input.email)) errors.push("Invalid email");
  if (input.phone && !isValidPhone(input.phone)) errors.push("Invalid phone number");
  if (!input.email && !input.phone) errors.push("At least one of email or phone is required");
  return errors;
}

/**
 * Parses and validates a whole CSV against the org's existing donor
 * normalized emails (no DB writes here — this is the read-only preview
 * step). A row is duplicate_in_file if an earlier row in the same file
 * already claims the same normalized email; duplicate_in_org if it matches
 * a donor already in the database.
 */
export function buildImportPreview(csvText: string, existingNormalizedEmails: Set<string>): ImportRowResult[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;
  const capped = dataRows.slice(0, IMPORT_ROW_CAP);
  const seenInFile = new Set<string>();

  return capped.map((row, idx) => {
    const input = mapCsvRow(headerRow, row);
    const normalizedEmail = normalizeEmail(input.email);
    const errors = validateImportRowInput(input);

    let status: ImportRowResult["status"] = errors.length > 0 ? "error" : "valid";
    if (status === "valid" && normalizedEmail) {
      if (seenInFile.has(normalizedEmail)) status = "duplicate_in_file";
      else if (existingNormalizedEmails.has(normalizedEmail)) status = "duplicate_in_org";
    }
    if (normalizedEmail && status === "valid") seenInFile.add(normalizedEmail);

    return { rowNumber: idx + 1, input, status, errors, normalizedEmail };
  });
}
