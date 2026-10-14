import crypto from "crypto";
import type { PlannedGift } from "./giftPlan";

/**
 * Pure builders for the Planning Center Giving donation request. No I/O, so
 * the exact bytes we would send can be unit-tested, hashed, stored for dry
 * runs and compared across attempts.
 */

export interface TargetFund {
  pcoFundId: string;
  via: "MAPPING" | "DEFAULT";
}

/** A mapped fund wins; everything else (including no fund at all) uses the default fund. */
export function resolveTargetFund(
  wgcFundId: string | null,
  mappingByFundId: Map<string, string>,
  defaultPcoFundId: string | null
): TargetFund | null {
  const mapped = wgcFundId ? mappingByFundId.get(wgcFundId) : undefined;
  if (mapped) return { pcoFundId: mapped, via: "MAPPING" };
  if (defaultPcoFundId) return { pcoFundId: defaultPcoFundId, via: "DEFAULT" };
  return null;
}

export interface DonationPayloadInput {
  gift: PlannedGift;
  paymentSourceId: string;
  pcoFundId: string;
  /** null = record as an anonymous donor. */
  pcoPersonId: string | null;
}

export interface DonationPayload {
  body: {
    data: {
      type: "Donation";
      attributes: Record<string, string | number>;
      relationships: Record<string, { data: { type: string; id: string } }>;
    };
    included: Array<{
      type: "Designation";
      attributes: { amount_cents: number };
      relationships: { fund: { data: { type: "Fund"; id: string } } };
    }>;
  };
  hash: string;
  /** Ids and amounts only — safe to store and show. Never names or card data. */
  summary: { amountCents: number; feeCents: number; receivedOn: string; method: string; pcoFundId: string; pcoPersonId: string | null };
}

export function buildDonationPayload(input: DonationPayloadInput): DonationPayload {
  const { gift } = input;
  const attributes: Record<string, string | number> = {
    payment_method: gift.method,
    received_at: gift.receivedOn,
    fee_cents: gift.feeCents,
  };
  if (gift.method === "card" && gift.cardSubtype) attributes.payment_method_sub = gift.cardSubtype;
  if (gift.method === "card" && gift.cardBrand) attributes.payment_brand = gift.cardBrand;
  if (gift.last4) attributes.payment_last4 = gift.last4;

  const relationships: DonationPayload["body"]["data"]["relationships"] = {
    payment_source: { data: { type: "PaymentSource", id: input.paymentSourceId } },
  };
  // No person relationship = "Anonymous Donor" in Planning Center.
  if (input.pcoPersonId) relationships.person = { data: { type: "Person", id: input.pcoPersonId } };

  const body: DonationPayload["body"] = {
    data: { type: "Donation", attributes, relationships },
    included: [
      {
        type: "Designation",
        attributes: { amount_cents: gift.amountCents },
        relationships: { fund: { data: { type: "Fund", id: input.pcoFundId } } },
      },
    ],
  };

  return {
    body,
    hash: crypto.createHash("sha256").update(stableStringify(body)).digest("hex"),
    summary: {
      amountCents: gift.amountCents,
      feeCents: gift.feeCents,
      receivedOn: gift.receivedOn,
      method: gift.method,
      pcoFundId: input.pcoFundId,
      pcoPersonId: input.pcoPersonId,
    },
  };
}

/** JSON with sorted keys, so the same payload always hashes the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The day batch's description: one batch per church per day. The date is in the name so an ambiguous create can be found by reading. */
export function dayBatchDescription(dateKey: string): string {
  return `WGC gifts · ${dateKey}`;
}

/** The batch description: carries the settlement id so an ambiguous create can be found again by reading. */
export function batchDescription(finixSettlementId: string, settledAt: Date | null): string {
  const date = settledAt ? ` · ${settledAt.toISOString().slice(0, 10)}` : "";
  return `WGC settlement ${finixSettlementId}${date}`;
}
