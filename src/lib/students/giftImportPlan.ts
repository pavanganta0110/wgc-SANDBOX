import { createHash } from "crypto";
import { parseCsv } from "@/lib/donors/csvImport";
import type { ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import { normalizeTermLabel, type StudentGivenFor } from "./constants";
import { MAX_STUDENT_IMPORT_ROWS, parseDollarsToCents } from "./importPlan";

export interface StudentGiftImportRow {
  rowNumber: number;
  studentNumber: string;
  donorName: string | null;
  donorEmail: string | null;
  amountCents: number | null;
  /** Noon UTC on the gift's calendar date, so no timezone shifts it a day. */
  date: Date | null;
  givenFor: Extract<StudentGivenFor, "SPONSOR" | "SELF">;
  method: ExternalPaymentMethod;
  termLabel: string | null;
  reference: string | null;
  /** Stable per-row key so re-importing the same file never doubles a gift. */
  fingerprint: string;
  errors: string[];
}

export interface StudentGiftImportParse {
  rows: StudentGiftImportRow[];
  fatalError?: string;
}

const H: Record<string, string[]> = {
  studentNumber: ["student id", "studentid", "student number", "student no", "student #", "id", "student_id", "studentnumber"],
  donorName: ["donor", "donor name", "given by", "sponsor", "sponsor name", "from"],
  donorEmail: ["donor email", "sponsor email", "donor e-mail"],
  amount: ["gift amount", "amount", "gift", "donation", "donation amount", "paid"],
  date: ["date", "gift date", "donation date", "received", "date received"],
  type: ["type", "gift type", "given for", "paid by"],
  method: ["method", "payment method", "paid with"],
  term: ["term", "semester", "term label"],
  reference: ["reference", "check number", "check #", "confirmation", "confirmation number", "reference number"],
};

const norm = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase();
const col = (headers: string[], key: string) => headers.findIndex((h) => H[key].includes(h));

/**
 * Decides what an uploaded file is. A gifts file names who gave or when
 * (donor / date columns); a roster file is students with an optional charge.
 */
export function detectStudentImportKind(csvText: string): "roster" | "gifts" {
  const first = parseCsv(csvText).find((r) => r.some((c) => c.trim() !== ""));
  const headers = (first ?? []).map(norm);
  return col(headers, "donorName") >= 0 || col(headers, "donorEmail") >= 0 || col(headers, "date") >= 0 ? "gifts" : "roster";
}

const METHOD_WORDS: [RegExp, ExternalPaymentMethod][] = [
  [/^cash\s*app/, "CASH_APP"],
  [/^cash$/, "CASH"],
  [/check|cheque/, "CHECK"],
  [/zelle/, "ZELLE"],
  [/venmo/, "VENMO"],
  [/paypal/, "PAYPAL"],
  [/ach|wire|bank|transfer|eft/, "BANK_TRANSFER"],
  [/card|clover|terminal|pos|visa|master|amex/, "EXTERNAL_CARD_TERMINAL"],
  [/money\s*order/, "MONEY_ORDER"],
];

/** Free-text method → one of the existing external payment methods. */
export function mapGiftMethod(raw: string): ExternalPaymentMethod {
  const v = raw.trim().toLowerCase();
  if (!v) return "OTHER";
  for (const [re, method] of METHOD_WORDS) if (re.test(v)) return method;
  return "OTHER";
}

/** YYYY-MM-DD, M/D/YYYY or M/D/YY → noon UTC; null when not a real date. */
export function parseGiftDate(raw: string): Date | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) {
    m = Number(match[1]);
    d = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

function parseType(raw: string): "SPONSOR" | "SELF" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "SPONSOR";
  if (/^(self|self[- ]?paid|self[- ]?funded|student|myself|own)$/.test(v)) return "SELF";
  if (/^(sponsor|sponsored|donor|donation|gift|third[- ]?party|family|parent)$/.test(v)) return "SPONSOR";
  return null;
}

/**
 * Parses a student gifts CSV. Pure — the server decides which Student IDs
 * exist; this only checks each row's own shape. `defaultTermLabel` fills in
 * rows with no Term cell.
 */
export function parseStudentGiftImport(csvText: string, defaultTermLabel?: string | null): StudentGiftImportParse {
  const table = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { rows: [], fatalError: "The file is empty." };
  const headers = table[0].map(norm);
  const c = {
    id: col(headers, "studentNumber"),
    donorName: col(headers, "donorName"),
    donorEmail: col(headers, "donorEmail"),
    amount: col(headers, "amount"),
    date: col(headers, "date"),
    type: col(headers, "type"),
    method: col(headers, "method"),
    term: col(headers, "term"),
    ref: col(headers, "reference"),
  };
  if (c.id < 0) return { rows: [], fatalError: 'Missing a "Student ID" column.' };
  if (c.amount < 0) return { rows: [], fatalError: 'Missing an "Amount" column.' };
  const dataRows = table.slice(1);
  if (dataRows.length > MAX_STUDENT_IMPORT_ROWS) {
    return { rows: [], fatalError: `Too many rows (${dataRows.length}); the limit is ${MAX_STUDENT_IMPORT_ROWS} per file.` };
  }

  const fallbackTerm = normalizeTermLabel(defaultTermLabel ?? null);
  const seen = new Map<string, number>();
  const rows = dataRows.map((cells, i): StudentGiftImportRow => {
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? "").trim() : "");
    const errors: string[] = [];

    const studentNumber = cell(c.id);
    if (!studentNumber) errors.push("Missing Student ID");

    const amountRaw = cell(c.amount);
    const amountCents = parseDollarsToCents(amountRaw);
    if (amountCents == null || amountCents < 1) errors.push(`Invalid amount "${amountRaw}"`);

    const dateRaw = cell(c.date);
    const date = dateRaw ? parseGiftDate(dateRaw) : null;
    if (!dateRaw) errors.push("Missing date");
    else if (!date) errors.push(`Invalid date "${dateRaw}" (use YYYY-MM-DD or M/D/YYYY)`);

    const donorEmail = cell(c.donorEmail) || null;
    if (donorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) errors.push("Invalid donor email");

    const typeRaw = cell(c.type);
    const givenFor = parseType(typeRaw);
    if (!givenFor) errors.push(`Unknown type "${typeRaw}" (use Sponsor or Self-paid)`);

    const termLabel = normalizeTermLabel(cell(c.term)) ?? fallbackTerm;
    if (!termLabel) errors.push("No term (add a Term column or set the current term)");

    const donorName = cell(c.donorName) || null;
    const reference = cell(c.ref) || null;
    const method = mapGiftMethod(cell(c.method));

    // Same gift twice in one file is allowed (two $50 checks); each repeat
    // gets its own occurrence number so a re-import still matches one-to-one.
    const base = [studentNumber.toLowerCase(), termLabel ?? "", date?.toISOString().slice(0, 10) ?? "", amountCents ?? "", (donorEmail ?? donorName ?? "").toLowerCase(), (reference ?? "").toLowerCase(), givenFor ?? ""].join("|");
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const fingerprint = "student-gift:" + createHash("sha1").update(`${base}|${occurrence}`).digest("hex").slice(0, 32);

    return {
      rowNumber: i + 1,
      studentNumber,
      donorName,
      donorEmail,
      amountCents,
      date,
      givenFor: givenFor ?? "SPONSOR",
      method,
      termLabel,
      reference,
      fingerprint,
      errors,
    };
  });
  return { rows };
}
