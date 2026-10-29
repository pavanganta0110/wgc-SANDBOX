/**
 * The "ledger row": one flat record per gift, shared by the donation.created
 * webhook payload and GET /api/v1/ledger so a consumer that reads both always
 * sees the same shape and the same numbers. Pure mapping only — every query
 * lives in loadLedger.ts. Money is always integer cents.
 */

export type LedgerSource = "WGC" | "EXTERNAL";

export interface LedgerDonor {
  id: string;
  name: string | null;
  /** Best-effort split of Donor.name (WGC stores one name field): last word is the last name. */
  firstName: string | null;
  lastName: string | null;
  /** Mailing-list salutation ("Mr. and Mrs.") when the giving page collected one. */
  salutation: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface LedgerRow {
  /** Stable id: the Payment id for WGC gifts, the ExternalDonation id for external ones. */
  id: string;
  source: LedgerSource;
  /** ISO 8601, UTC. Convert to the campus timezone on the consuming side. */
  date: string;
  kind: "one-time" | "recurring";
  method: "card" | "ach" | "external";
  cardBrand: string | null;
  /** Only for external gifts: cash, check, etc. as recorded. */
  externalMethod: string | null;
  status: string;
  designation: { fundId: string | null; fundName: string | null };
  donor: LedgerDonor | null;
  /** The gift before any fee cover. */
  giftCents: number;
  /** What the donor added to cover fees. */
  feeCoveredCents: number;
  feeCoveredElected: boolean;
  /** Total charged to the donor: gift plus fee cover. */
  chargedCents: number;
  /** What the processor actually took; null until the processor has reported it. */
  processingFeeCents: number | null;
  /** Net to the organization. Falls back to the expected net until the actual fee is known. */
  netCents: number | null;
  refundedCents: number;
  refunded: boolean;
  disputed: boolean;
  disputeState: string | null;
  /** An ACH gift the bank returned. */
  returned: boolean;
  /** An external gift that was voided. Always false for WGC gifts. */
  voided: boolean;
  /** Ties every renewal to one recurring commitment. */
  subscriptionId: string | null;
  fairMarketValueCents: number | null;
  goodsDescription: string | null;
  /** Settlement / deposit the gift landed in. Null until it settles. */
  payoutId: string | null;
  givingLinkId: string | null;
  receiptNumber: string | null;
}

export interface LedgerDonorSource {
  id: string;
  name: string | null;
  salutation: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface LedgerPaymentSource {
  id: string;
  donorId: string | null;
  createdAt: Date;
  status: string;
  paymentMethodType: string;
  cardBrand: string | null;
  amountCents: number;
  donationAmountCents: number | null;
  feeCoveredCents: number | null;
  donorCoversFee: boolean | null;
  actualFinixFeesCents: number | null;
  merchantExpectedNetCents: number | null;
  fundId: string | null;
  fundName: string | null;
  finixSubscriptionId: string | null;
  finixTransferId: string | null;
  goodsServicesProvided: boolean;
  goodsServicesDescription: string | null;
  goodsServicesFairMarketValueCents: number | null;
  givingLinkId: string | null;
  receiptNumber: string | null;
}

export interface LedgerExternalSource {
  id: string;
  donorId: string | null;
  donationDate: Date;
  paymentMethod: string;
  status: string;
  donationAmountCents: number;
  supplementalFeeCents: number;
  processingFeeCents: number;
  providerFeeCents: number | null;
  netAmountReceivedCents: number | null;
  fundId: string | null;
  fundName: string | null;
  goodsOrServicesProvided: boolean;
  goodsOrServicesDescription: string | null;
  goodsOrServicesValueCents: number | null;
  finixSettlementId: string | null;
  voidedAt: Date | null;
  receiptNumber: string | null;
}

export interface LedgerLookups {
  donors: Map<string, LedgerDonorSource>;
  /** Successful refund cents per original Payment id (failed/canceled refunds already excluded). */
  refundedCentsByPaymentId: Map<string, number>;
  /** State of the first dispute per Payment id. */
  disputeStateByPaymentId: Map<string, string | null>;
  /** Settlement and fee per Finix transfer id. */
  transfersByFinixTransferId: Map<string, { settlementId: string | null; feeCents: number | null }>;
}

/**
 * WGC stores one Donor.name, so first/last are a best-effort split: the last
 * whitespace-separated word is the last name, everything before it the first.
 * A single word is treated as a first name only.
 */
export function splitDonorName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function toLedgerDonor(donor: LedgerDonorSource | null | undefined): LedgerDonor | null {
  if (!donor) return null;
  const { firstName, lastName } = splitDonorName(donor.name);
  return {
    id: donor.id,
    name: donor.name,
    firstName,
    lastName,
    salutation: donor.salutation,
    email: donor.email,
    phone: donor.phone,
    addressLine1: donor.addressLine1,
    addressLine2: donor.addressLine2,
    city: donor.city,
    state: donor.state,
    postalCode: donor.postalCode,
    country: donor.country,
  };
}

export function buildPaymentLedgerRow(payment: LedgerPaymentSource, lookups: LedgerLookups): LedgerRow {
  const transfer = payment.finixTransferId ? lookups.transfersByFinixTransferId.get(payment.finixTransferId) : undefined;
  const processingFeeCents = payment.actualFinixFeesCents ?? transfer?.feeCents ?? null;
  const feeCoveredCents = payment.feeCoveredCents ?? 0;
  const refundedCents = lookups.refundedCentsByPaymentId.get(payment.id) ?? 0;
  const disputeKnown = lookups.disputeStateByPaymentId.has(payment.id);
  const isBank = payment.paymentMethodType === "BANK_ACCOUNT";

  return {
    id: payment.id,
    source: "WGC",
    date: payment.createdAt.toISOString(),
    kind: payment.finixSubscriptionId ? "recurring" : "one-time",
    method: isBank ? "ach" : "card",
    cardBrand: isBank ? null : payment.cardBrand,
    externalMethod: null,
    status: payment.status,
    designation: { fundId: payment.fundId, fundName: payment.fundName },
    donor: toLedgerDonor(payment.donorId ? lookups.donors.get(payment.donorId) : null),
    giftCents: payment.donationAmountCents ?? payment.amountCents,
    feeCoveredCents,
    feeCoveredElected: payment.donorCoversFee ?? feeCoveredCents > 0,
    chargedCents: payment.amountCents,
    processingFeeCents,
    netCents: processingFeeCents != null ? payment.amountCents - processingFeeCents : payment.merchantExpectedNetCents,
    refundedCents,
    refunded: refundedCents > 0,
    disputed: disputeKnown,
    disputeState: disputeKnown ? lookups.disputeStateByPaymentId.get(payment.id) ?? null : null,
    returned: payment.status === "RETURNED",
    voided: false,
    subscriptionId: payment.finixSubscriptionId,
    fairMarketValueCents: payment.goodsServicesProvided ? payment.goodsServicesFairMarketValueCents : null,
    goodsDescription: payment.goodsServicesProvided ? payment.goodsServicesDescription : null,
    payoutId: transfer?.settlementId ?? null,
    givingLinkId: payment.givingLinkId,
    receiptNumber: payment.receiptNumber,
  };
}

export function buildExternalLedgerRow(donation: LedgerExternalSource, lookups: LedgerLookups): LedgerRow {
  const processingFeeCents = donation.processingFeeCents || donation.providerFeeCents || null;
  return {
    id: donation.id,
    source: "EXTERNAL",
    date: donation.donationDate.toISOString(),
    kind: "one-time",
    method: "external",
    cardBrand: null,
    externalMethod: donation.paymentMethod,
    status: donation.status,
    designation: { fundId: donation.fundId, fundName: donation.fundName },
    donor: toLedgerDonor(donation.donorId ? lookups.donors.get(donation.donorId) : null),
    giftCents: donation.donationAmountCents,
    feeCoveredCents: donation.supplementalFeeCents,
    feeCoveredElected: donation.supplementalFeeCents > 0,
    chargedCents: donation.donationAmountCents + donation.supplementalFeeCents,
    processingFeeCents,
    netCents: donation.netAmountReceivedCents,
    refundedCents: 0,
    refunded: false,
    disputed: false,
    disputeState: null,
    returned: false,
    voided: donation.voidedAt != null,
    subscriptionId: null,
    fairMarketValueCents: donation.goodsOrServicesProvided ? donation.goodsOrServicesValueCents : null,
    goodsDescription: donation.goodsOrServicesProvided ? donation.goodsOrServicesDescription : null,
    payoutId: donation.finixSettlementId,
    givingLinkId: null,
    receiptNumber: donation.receiptNumber,
  };
}
