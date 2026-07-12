/**
 * Maps a raw, processor-reported fee type string to a friendly label and a
 * safe, verified-only description. The raw type is never renamed to imply
 * who receives the fee (donor/WGC/processor) — that would require
 * confirmation against the actual pricing/settlement agreement, which this
 * codebase doesn't have. Unrecognized types fall back to an honest generic
 * label rather than a fabricated one.
 */
export interface MappedFeeType {
  label: string;
  description: string;
}

export function mapFeeType(rawFeeType: string | null | undefined): MappedFeeType {
  const type = (rawFeeType || "").toUpperCase();

  if (type.includes("SUPPLEMENTAL")) {
    return {
      label: "Supplemental Fee",
      description: "Additional fee associated with this transaction under the organization's processing configuration.",
    };
  }
  if (type.includes("ACH")) {
    return { label: "ACH Fee", description: "Fee charged for processing this transaction as an ACH/bank transfer." };
  }
  if (type.includes("CARD") && (type.includes("PERCENT") || type.includes("RATE"))) {
    return { label: "Card Percentage Fee", description: "Percentage-based fee charged for processing this card transaction." };
  }
  if (type.includes("CARD") && (type.includes("FIXED") || type.includes("FLAT"))) {
    return { label: "Card Fixed Fee", description: "Flat per-transaction fee charged for processing this card transaction." };
  }
  if (type.includes("RECURRING") || type.includes("SUBSCRIPTION")) {
    return { label: "Recurring Fee", description: "Fee associated with this transaction's recurring billing schedule." };
  }
  if (type.includes("PLATFORM")) {
    return { label: "Platform Fee", description: "Platform-level fee applied to this transaction." };
  }
  if (!type) {
    return { label: "Fee", description: "Fee reported by the payment processor for this transaction." };
  }
  return {
    label: type.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" "),
    description: "Fee reported by the payment processor for this transaction — not yet mapped to a friendly category.",
  };
}
