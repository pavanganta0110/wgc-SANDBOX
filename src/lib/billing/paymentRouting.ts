import { prisma } from "@/lib/prisma";
import { getWgcBillingMerchantId, getConfiguredFinixEnvironment } from "@/lib/billing/wgcBillingConfig";

/**
 * The single trusted server-side service that decides which Finix merchant
 * a charge is processed through. This is the load-bearing safety boundary
 * between WGC's own money (platform subscription, invoice add-on/usage,
 * plan upgrades) and every client organization's own money (donations,
 * recurring giving, customer invoice payments) — the two must never cross.
 *
 * Every caller MUST resolve the merchant through resolveProcessingMerchant()
 * rather than reading Church.finixMerchantId or FINIX_WGC_BILLING_MERCHANT_ID
 * directly, and MUST NEVER accept a merchant ID as a request parameter —
 * there is deliberately no "merchantId" argument anywhere in this module's
 * public API. The organizationId passed in must itself come from a trusted
 * source (the authenticated session / a loaded DB record), never a raw
 * client-submitted value used without ownership verification.
 */

export type WgcChargeType = "WGC_PLATFORM_SUBSCRIPTION" | "WGC_INVOICE_ADD_ON" | "WGC_INVOICE_USAGE" | "WGC_PLAN_UPGRADE";

export type MerchantChargeType =
  | "MERCHANT_DONATION"
  | "MERCHANT_RECURRING_DONATION"
  | "MERCHANT_INVOICE_PAYMENT"
  | "MERCHANT_MERCHANDISE_ORDER"
  | "MERCHANT_OTHER_PAYMENT";

export type ChargeType = WgcChargeType | MerchantChargeType;

const WGC_CHARGE_TYPES: ReadonlySet<ChargeType> = new Set<ChargeType>([
  "WGC_PLATFORM_SUBSCRIPTION",
  "WGC_INVOICE_ADD_ON",
  "WGC_INVOICE_USAGE",
  "WGC_PLAN_UPGRADE",
]);

export function isWgcChargeType(chargeType: ChargeType): chargeType is WgcChargeType {
  return WGC_CHARGE_TYPES.has(chargeType);
}

export class PaymentRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentRoutingError";
  }
}

export interface ResolvedMerchant {
  chargeType: ChargeType;
  organizationId: string;
  merchantId: string;
  /** true = WGC's own billing merchant; false = the organization's own
   * approved Finix merchant. Callers should prefer branching on this over
   * re-deriving isWgcChargeType(chargeType) themselves. */
  isWgcBillingMerchant: boolean;
}

/**
 * Resolves the correct Finix merchant for a charge, entirely server-side.
 *
 * WGC_PLATFORM_SUBSCRIPTION / WGC_INVOICE_ADD_ON / WGC_INVOICE_USAGE /
 * WGC_PLAN_UPGRADE -> FINIX_WGC_BILLING_MERCHANT_ID (fails closed if unset —
 * see getWgcBillingMerchantId).
 *
 * MERCHANT_DONATION / MERCHANT_RECURRING_DONATION / MERCHANT_INVOICE_PAYMENT
 * / MERCHANT_OTHER_PAYMENT -> the organization's own Church.finixMerchantId,
 * loaded fresh from the database (never trusted from a caller-supplied
 * value) — throws if the organization has no approved merchant, mirroring
 * the existing donate-route/invoice-pay-route guard pattern.
 */
export async function resolveProcessingMerchant(chargeType: ChargeType, organizationId: string): Promise<ResolvedMerchant> {
  if (!organizationId) {
    throw new PaymentRoutingError("resolveProcessingMerchant requires a trusted organizationId — none was provided.");
  }

  if (isWgcChargeType(chargeType)) {
    const merchantId = getWgcBillingMerchantId();
    return { chargeType, organizationId, merchantId, isWgcBillingMerchant: true };
  }

  const church = await prisma.church.findUnique({ where: { id: organizationId }, select: { finixMerchantId: true } });
  if (!church?.finixMerchantId) {
    throw new PaymentRoutingError(
      `Organization ${organizationId} has no approved Finix merchant on file — cannot process a ${chargeType} charge.`,
    );
  }
  return { chargeType, organizationId, merchantId: church.finixMerchantId, isWgcBillingMerchant: false };
}

/**
 * Defense-in-depth check for the "reject any cross-merchant mismatch" rule
 * — call this wherever a merchant ID is about to be reused from a
 * previously-loaded record (e.g. a refund reusing the original transfer's
 * merchant) to confirm it still matches what routing would resolve today,
 * rather than trusting the stored value blindly forever.
 */
export function assertMerchantMatches(resolved: ResolvedMerchant, expectedMerchantId: string): void {
  if (resolved.merchantId !== expectedMerchantId) {
    throw new PaymentRoutingError(
      `Cross-merchant mismatch for organization ${resolved.organizationId}: resolved merchant ${resolved.merchantId} does not match expected merchant ${expectedMerchantId}. Refusing to process.`,
    );
  }
}

export interface TrustedFinixTagsInput {
  organizationId: string;
  chargeType: ChargeType;
  subscriptionId?: string;
  invoiceId?: string;
  billingChargeId?: string;
}

/**
 * Builds the trusted Finix tags connecting a transaction back to the WGC
 * record that created it. Deliberately whitelist-only — never spreads an
 * arbitrary object, so no personal or sensitive data can end up in a Finix
 * tag by accident.
 */
export function buildTrustedFinixTags(input: TrustedFinixTagsInput): Record<string, string> {
  const tags: Record<string, string> = {
    wgc_organization_id: input.organizationId,
    wgc_charge_type: input.chargeType,
    wgc_environment: getConfiguredFinixEnvironment(),
  };
  if (input.subscriptionId) tags.wgc_subscription_id = input.subscriptionId;
  if (input.invoiceId) tags.wgc_invoice_id = input.invoiceId;
  if (input.billingChargeId) tags.wgc_billing_charge_id = input.billingChargeId;
  return tags;
}

/** Deterministic idempotency key from trusted parts only — never includes
 * a client-submitted free-text value verbatim. */
export function buildIdempotencyKey(...parts: (string | number)[]): string {
  const clean = parts.map((p) => String(p).trim()).filter(Boolean);
  if (clean.length === 0) {
    throw new PaymentRoutingError("buildIdempotencyKey requires at least one non-empty part.");
  }
  return clean.join(":");
}
