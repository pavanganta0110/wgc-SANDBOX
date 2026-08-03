import { calculateLineItem, calculateInvoiceTotals, type LineItemInput, type LineItemCalculated } from "./invoiceMoney";

export interface RawLineItemInput {
  description: string;
  detailedDescription?: string | null;
  quantity: number;
  unitPriceCents: number;
  discountType?: "FIXED" | "PERCENTAGE";
  discountValue?: number;
  taxRateBasisPoints?: number | null;
  productCode?: string | null;
  sortOrder?: number;
}

export interface ParsedLineItem {
  input: RawLineItemInput;
  calculated: LineItemCalculated;
}

export interface LineItemParseResult {
  valid: boolean;
  error?: string;
  items: ParsedLineItem[];
}

/** Validates and computes every line item from raw request-body JSON in one
 * pass — the only place line item money math happens server-side for a
 * create/update request. Never trusts a client-submitted totalCents. */
export function parseAndCalculateLineItems(raw: unknown): LineItemParseResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { valid: false, error: "At least one line item is required.", items: [] };
  }

  const items: ParsedLineItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) {
      return { valid: false, error: `Line item ${i + 1} is missing a description.`, items: [] };
    }
    const quantity = Number(item.quantity);
    const unitPriceCents = Number(item.unitPriceCents);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { valid: false, error: `Line item ${i + 1} has an invalid quantity.`, items: [] };
    }
    if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
      return { valid: false, error: `Line item ${i + 1} has an invalid unit price.`, items: [] };
    }
    const discountType = item.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
    const discountValue = Number.isFinite(Number(item.discountValue)) ? Number(item.discountValue) : 0;
    const taxRateBasisPoints = item.taxRateBasisPoints != null && Number.isFinite(Number(item.taxRateBasisPoints)) ? Number(item.taxRateBasisPoints) : null;

    const input: LineItemInput = { quantity, unitPriceCents, discountType, discountValue, taxRateBasisPoints };
    let calculated: LineItemCalculated;
    try {
      calculated = calculateLineItem(input);
    } catch {
      return { valid: false, error: `Line item ${i + 1} could not be calculated.`, items: [] };
    }

    items.push({
      input: {
        description,
        detailedDescription: typeof item.detailedDescription === "string" ? item.detailedDescription.trim().slice(0, 2000) || null : null,
        quantity,
        unitPriceCents,
        discountType,
        discountValue,
        taxRateBasisPoints,
        productCode: typeof item.productCode === "string" ? item.productCode.trim().slice(0, 100) || null : null,
        sortOrder: i,
      },
      calculated,
    });
  }

  return { valid: true, items };
}

export function totalsFromParsedItems(items: ParsedLineItem[], invoiceLevelDiscountCents: number, serviceFeeCents: number) {
  return calculateInvoiceTotals({
    lineItems: items.map((i) => i.calculated),
    invoiceLevelDiscountCents,
    serviceFeeCents,
  });
}
