import { parseCsv } from "@/lib/donors/csvImport";
import { validateItemInput, type ItemInput } from "./auctionConfig";

/**
 * Adding many items at once from a spreadsheet saved as CSV. Column names are forgiving ("Title" or "Item name",
 * "Starting bid" or "start"). Every row is checked exactly like an item typed by hand, and a problem is reported
 * against its row number so the organization can fix the file; nothing is added unless the whole file is valid.
 */

export const ITEM_IMPORT_ROW_CAP = 300;

export const ITEM_TEMPLATE_CSV = [
  "title,description,starting bid,minimum raise,fair market value,donated by,category,photo link",
  '"Weekend Cabin Getaway","Two nights in a lakeside cabin for up to six guests.",100,10,300,"Smith Family","Experiences",',
  '"Signed Football","Signed by the 2026 team.",50,5,75,"Coach Davis","Sports",',
].join("\n");

const ALIASES: Record<string, string> = {
  title: "title", name: "title", item: "title", "item name": "title", "item title": "title",
  description: "description", details: "description", about: "description",
  "starting bid": "start", start: "start", "starting price": "start", "opening bid": "start", "start bid": "start",
  "minimum raise": "raise", "min raise": "raise", raise: "raise", increment: "raise", "bid increment": "raise",
  "fair market value": "fmv", fmv: "fmv", value: "fmv", "retail value": "fmv", "market value": "fmv",
  "donated by": "donatedBy", donor: "donatedBy", sponsor: "donatedBy", "donated by (optional)": "donatedBy",
  category: "category", group: "category", type: "category",
  "photo link": "image", photo: "image", image: "image", "image url": "image", "photo url": "image", picture: "image",
};

/** "$1,250.50" or "100" → whole cents, or null if it is not a plain money amount. */
export function moneyToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export interface ItemImportResult {
  rows: ItemInput[];
  errors: { row: number; message: string }[];
}

export function parseItemCsv(text: string): ItemImportResult {
  const table = parseCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { rows: [], errors: [{ row: 1, message: "The file needs a header row and at least one item." }] };
  if (table.length - 1 > ITEM_IMPORT_ROW_CAP) return { rows: [], errors: [{ row: 1, message: `Import at most ${ITEM_IMPORT_ROW_CAP} items at a time.` }] };

  const columns = table[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? null);
  for (const required of ["title", "start", "fmv"]) {
    if (!columns.includes(required)) {
      const names: Record<string, string> = { title: "title", start: "starting bid", fmv: "fair market value" };
      return { rows: [], errors: [{ row: 1, message: `Add a "${names[required]}" column.` }] };
    }
  }

  const rows: ItemInput[] = [];
  const errors: ItemImportResult["errors"] = [];
  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const get = (key: string) => {
      const at = columns.indexOf(key);
      return at >= 0 ? (cells[at] ?? "").trim() : "";
    };
    const start = moneyToCents(get("start"));
    const fmv = get("fmv") === "" ? null : moneyToCents(get("fmv"));
    const raiseText = get("raise");
    const raise = raiseText === "" ? 500 : moneyToCents(raiseText);
    if (start === null) return void errors.push({ row: rowNumber, message: "The starting bid isn't a dollar amount." });
    if (fmv === null) return void errors.push({ row: rowNumber, message: "The fair market value is missing or isn't a dollar amount (use 0 if it has no value)." });
    if (raise === null) return void errors.push({ row: rowNumber, message: "The minimum raise isn't a dollar amount." });

    const image = get("image");
    if (image && !/^https:\/\//i.test(image)) return void errors.push({ row: rowNumber, message: "The photo link must start with https://" });

    const parsed = validateItemInput({
      title: get("title"), description: get("description"), imageUrl: image, startingBidCents: start, minIncrementCents: raise,
      fairMarketValueCents: fmv, donatedBy: get("donatedBy"), category: get("category"),
    });
    if (!parsed.ok) errors.push({ row: rowNumber, message: parsed.error });
    else rows.push(parsed.value);
  });
  return { rows, errors };
}
