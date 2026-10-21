/**
 * Parses Finix's dashboard "Residual Settlements" export (CSV, or the same
 * table pasted as tab-separated text). Pure: no I/O, so it's unit-tested
 * directly. Columns are matched by header name, not position.
 *
 * Money cells look like "$97.95-USD", "$56.69617-USD", "($3.03485)-USD".
 */

export interface ParsedResidualSettlement {
  finixBillingSettlementId: string;
  windowStart: Date;
  windowEnd: Date;
  type: string | null;
  applicationName: string | null;
  merchantFeesCents: number;
  costsCents: number;
  residualSubtotalCents: number;
  revSharePercent: number;
  totalResidualCents: number;
  state: string;
}

export interface ParseResult {
  rows: ParsedResidualSettlement[];
  errors: string[];
}

const COLUMNS = {
  id: "id",
  start: "billing window start",
  end: "billing window end",
  type: "type",
  app: "application business name",
  fees: "merchant fees",
  costs: "network and finix costs",
  subtotal: "residual subtotal",
  share: "rev share",
  total: "total residual",
  state: "state",
} as const;

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/** "$97.95-USD" -> 9795, "($3.03485)-USD" -> -303.485. Null when not a money value. */
export function parseMoneyCents(raw: string): number | null {
  const s = raw.replace(/-?\s*USD$/i, "").replace(/[\s,]/g, "");
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const digits = s.replace(/[()$-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const cents = Number(digits) * 100;
  return Math.round((negative ? -cents : cents) * 1000) / 1000;
}

export function parseResidualSettlementsExport(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^﻿/, "")).filter((l) => l.trim());
  const errors: string[] = [];
  const headerIndex = lines.findIndex((l) => /billing window start/i.test(l));
  if (headerIndex === -1) return { rows: [], errors: ["Couldn't find the header row. Paste or upload Finix's Residual Settlements export as-is."] };

  const delimiter = lines[headerIndex].includes("\t") ? "\t" : ",";
  const header = splitLine(lines[headerIndex], delimiter).map((h) => h.toLowerCase());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, name]) => [k, header.indexOf(name)])) as Record<keyof typeof COLUMNS, number>;
  const missing = Object.entries(col).filter(([k, i]) => i === -1 && k !== "type" && k !== "app").map(([k]) => COLUMNS[k as keyof typeof COLUMNS]);
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}.`] };

  const rows: ParsedResidualSettlement[] = [];
  for (const [n, line] of lines.slice(headerIndex + 1).entries()) {
    const cells = splitLine(line, delimiter);
    const get = (k: keyof typeof COLUMNS) => (col[k] >= 0 ? cells[col[k]] ?? "" : "");
    const id = get("id");
    if (!id) continue;
    const label = `Row ${n + 1} (${id})`;
    if (!/^billing_settlement_/i.test(id)) {
      errors.push(`${label}: ID doesn't look like a Finix billing settlement.`);
      continue;
    }
    const windowStart = new Date(get("start"));
    const windowEnd = new Date(get("end"));
    const fees = parseMoneyCents(get("fees"));
    const costs = parseMoneyCents(get("costs"));
    const subtotal = parseMoneyCents(get("subtotal"));
    const total = parseMoneyCents(get("total"));
    const share = Number(get("share").replace("%", ""));
    const state = get("state").toUpperCase();
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime()) || windowEnd <= windowStart) {
      errors.push(`${label}: billing window dates aren't valid.`);
      continue;
    }
    if (fees === null || costs === null || subtotal === null || total === null || !Number.isFinite(share) || !state) {
      errors.push(`${label}: an amount, rev share or state couldn't be read.`);
      continue;
    }
    rows.push({
      finixBillingSettlementId: id,
      windowStart,
      windowEnd,
      type: get("type") || null,
      applicationName: get("app") || null,
      merchantFeesCents: Math.round(fees),
      // Finix shows costs as positive in this export; stored positive.
      costsCents: Math.abs(costs),
      residualSubtotalCents: subtotal,
      revSharePercent: share,
      totalResidualCents: Math.round(total),
      state,
    });
  }
  if (rows.length === 0 && errors.length === 0) errors.push("No settlement rows found under the header.");
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Billing Transfers export: the actual payouts (CREDIT) and collections
// (DEBIT) for residuals, e.g.
//   id,createdAt,updatedAt,amount,currency,depositType,state,paymentInstrumentId,linkedTo
//   billing_transfer_cE4m…,2026-09-15T01:24:37.72Z,…,7.26,USD,CREDIT,SUCCEEDED,PI639…,APjM…
// ---------------------------------------------------------------------------

export interface ParsedBillingTransfer {
  finixBillingTransferId: string;
  createdAtFinix: Date;
  amountCents: number;
  currency: string;
  depositType: "CREDIT" | "DEBIT";
  state: string;
  paymentInstrumentId: string | null;
  linkedTo: string | null;
}

export type ExportKind = "RESIDUAL_SETTLEMENTS" | "BILLING_TRANSFERS" | null;

/** Which Finix export this is, from its header row. */
export function detectExportKind(text: string): ExportKind {
  const header = text.split(/\r?\n/).find((l) => l.trim())?.toLowerCase() ?? "";
  if (/billing window start/.test(header)) return "RESIDUAL_SETTLEMENTS";
  if (/deposittype/.test(header.replace(/[\s_]/g, ""))) return "BILLING_TRANSFERS";
  // Header may be preceded by a title line; look further.
  if (/billing window start/i.test(text)) return "RESIDUAL_SETTLEMENTS";
  if (/deposit\s*_?type/i.test(text)) return "BILLING_TRANSFERS";
  return null;
}

export function parseBillingTransfersExport(text: string): { rows: ParsedBillingTransfer[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^﻿/, "")).filter((l) => l.trim());
  const headerIndex = lines.findIndex((l) => /deposit\s*_?type/i.test(l));
  if (headerIndex === -1) return { rows: [], errors: ["Couldn't find the header row. Upload Finix's Billing Transfers export as-is."] };
  const delimiter = lines[headerIndex].includes("\t") ? "\t" : ",";
  const norm = (h: string) => h.toLowerCase().replace(/[\s_]/g, "");
  const header = splitLine(lines[headerIndex], delimiter).map(norm);
  const idx = (name: string) => header.indexOf(name);
  const col = { id: idx("id"), created: idx("createdat"), amount: idx("amount"), currency: idx("currency"), type: idx("deposittype"), state: idx("state"), pi: idx("paymentinstrumentid"), linked: idx("linkedto") };
  const missing = (["id", "created", "amount", "type", "state"] as const).filter((k) => col[k] === -1);
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}.`] };

  const rows: ParsedBillingTransfer[] = [];
  const errors: string[] = [];
  for (const [n, line] of lines.slice(headerIndex + 1).entries()) {
    const cells = splitLine(line, delimiter);
    const get = (i: number) => (i >= 0 ? cells[i] ?? "" : "");
    const id = get(col.id);
    if (!id) continue;
    const label = `Row ${n + 1} (${id})`;
    if (!/^billing_transfer_/i.test(id)) {
      errors.push(`${label}: ID doesn't look like a Finix billing transfer.`);
      continue;
    }
    const createdAtFinix = new Date(get(col.created));
    const amount = parseMoneyCents(get(col.amount));
    const depositType = get(col.type).toUpperCase();
    const state = get(col.state).toUpperCase();
    if (Number.isNaN(createdAtFinix.getTime()) || amount === null || (depositType !== "CREDIT" && depositType !== "DEBIT") || !state) {
      errors.push(`${label}: date, amount, deposit type or state couldn't be read.`);
      continue;
    }
    rows.push({
      finixBillingTransferId: id,
      createdAtFinix,
      amountCents: Math.round(Math.abs(amount)),
      currency: get(col.currency) || "USD",
      depositType,
      state,
      paymentInstrumentId: get(col.pi) || null,
      linkedTo: get(col.linked) || null,
    });
  }
  if (rows.length === 0 && errors.length === 0) errors.push("No billing transfer rows found under the header.");
  return { rows, errors };
}
