import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";

export const ADDRESS_SOURCES = [
  "ONLINE_DONATION_FORM",
  "MERCHANT_MANUAL_ENTRY",
  "EXTERNAL_DONATION",
  "DONOR_PORTAL",
  "CRM_IMPORT",
  "CSV_IMPORT",
  "DONATION_ENVELOPE",
  "CHECK",
  "PLEDGE_FORM",
  "EXISTING_ORGANIZATION_RECORD",
  "OTHER",
] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

export function isAddressSource(value: unknown): value is AddressSource {
  return typeof value === "string" && (ADDRESS_SOURCES as readonly string[]).includes(value);
}

export const ADDRESS_VERIFICATION_STATUSES = ["UNVERIFIED", "CONFIRMED_BY_DONOR", "CONFIRMED_BY_ORG"] as const;
export type AddressVerificationStatus = (typeof ADDRESS_VERIFICATION_STATUSES)[number];

export const ADDRESS_FIELD_MAX_LENGTHS = {
  addressLine1: 200,
  addressLine2: 200,
  city: 100,
  state: 100,
  postalCode: 20,
  country: 100,
} as const;

export interface AddressInput {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface AddressSnapshot extends AddressInput {
  addressSource: string | null;
  addressVerified: string;
  lastAddressConfirmedAt: Date | null;
  addressUpdatedAt: Date | null;
  addressUpdatedByUserId: string | null;
}

const ADDRESS_FIELDS = ["addressLine1", "addressLine2", "city", "state", "postalCode", "country"] as const;

/** Trims and length-caps a single address field. Empty string normalizes to null (an address field is either a real value or absent, never an empty string). */
export function cleanAddressField(value: unknown, field: keyof typeof ADDRESS_FIELD_MAX_LENGTHS): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, ADDRESS_FIELD_MAX_LENGTHS[field]);
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanAddressInput(raw: Record<string, unknown>): AddressInput {
  const result: AddressInput = {};
  for (const field of ADDRESS_FIELDS) {
    if (field in raw) result[field] = cleanAddressField(raw[field], field);
  }
  return result;
}

/** True when a value actually addresses a physical location — used to decide whether an "address section" was filled in at all (e.g. before defaulting country, before persisting). */
export function hasAnyAddressField(input: AddressInput): boolean {
  return Boolean(input.addressLine1 || input.addressLine2 || input.city || input.state || input.postalCode || input.country);
}

function addressesDiffer(a: AddressInput, b: AddressInput): boolean {
  return ADDRESS_FIELDS.some((f) => (a[f] ?? null) !== (b[f] ?? null));
}

/** Safe (non-PII-in-logs) summary of an address for audit metadata — full values are fine in DashboardAuditLog.metadata (an internal, permission-gated table), but never in console/error logs. */
function toAuditValue(input: AddressInput | null) {
  if (!input || !hasAnyAddressField(input)) return null;
  return {
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
  };
}

export interface ApplyAddressUpdateOptions {
  donorId: string;
  churchId: string;
  newAddress: AddressInput;
  source: AddressSource;
  /** True when the person physically at the address typed it themselves
   * (online giving form, donor portal) — per spec, a donor-entered address
   * may become current directly. False for merchant/import-entered
   * addresses, which the caller should confirm with the merchant before
   * calling this with `force: true`. */
  enteredByDonor: boolean;
  /** Caller has already gotten merchant confirmation to replace a
   * differing existing address (e.g. the merchant clicked "Replace" on a
   * warning dialog, or a CSV import row was marked "Replace"). */
  force?: boolean;
  /** CONFIRMED_BY_DONOR when the donor themselves is the one submitting
   * this address right now (online giving, donor portal); null otherwise
   * — a merchant-entered or imported address stays UNVERIFIED until
   * explicitly confirmed. */
  verifiedAs?: AddressVerificationStatus | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}

export type ApplyAddressUpdateResult =
  | { status: "unchanged" }
  | { status: "updated"; donor: any }
  | { status: "needs_confirmation"; previous: AddressInput };

/**
 * The single place every address-writing path (donor edit, external
 * donation, online giving, CSV/CRM import) should go through — implements
 * the "do not silently overwrite" rule: a donor-entered address may replace
 * the current one directly; anything else (merchant entry, import) that
 * actually differs from a non-empty existing address requires the caller to
 * have already obtained confirmation (`force: true`), otherwise this
 * returns `needs_confirmation` without writing anything.
 */
export async function applyDonorAddressUpdate(opts: ApplyAddressUpdateOptions): Promise<ApplyAddressUpdateResult> {
  const donor = await prisma.donor.findFirst({ where: { id: opts.donorId, churchId: opts.churchId } });
  if (!donor) throw new Error("Donor not found");

  const existing: AddressInput = {
    addressLine1: donor.addressLine1,
    addressLine2: donor.addressLine2,
    city: donor.city,
    state: donor.state,
    postalCode: donor.postalCode,
    country: donor.country,
  };

  if (!addressesDiffer(existing, opts.newAddress)) {
    return { status: "unchanged" };
  }

  const existingIsPopulated = hasAnyAddressField(existing);
  if (existingIsPopulated && !opts.enteredByDonor && !opts.force) {
    return { status: "needs_confirmation", previous: existing };
  }

  const now = new Date();
  const verified: AddressVerificationStatus = opts.verifiedAs ?? "UNVERIFIED";

  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: {
      ...opts.newAddress,
      addressSource: opts.source,
      addressVerified: verified,
      lastAddressConfirmedAt: verified !== "UNVERIFIED" ? now : donor.lastAddressConfirmedAt,
      addressUpdatedAt: now,
      addressUpdatedByUserId: opts.actorUserId ?? null,
    },
  });

  await logDashboardAction({
    churchId: opts.churchId,
    actorUserId: opts.actorUserId ?? null,
    actorEmail: opts.actorEmail ?? null,
    actorRole: opts.actorRole ?? null,
    action: existingIsPopulated ? "donor.address_updated" : "donor.address_created",
    entityType: "donor",
    entityId: donor.id,
    metadata: {
      source: opts.source,
      previousAddress: toAuditValue(existing),
      newAddress: toAuditValue(opts.newAddress),
    },
    req: opts.req,
  });

  return { status: "updated", donor: updated };
}

/** Clears a donor's address — the prior value is preserved in the audit log (donor.address_cleared), never deleted from history. */
export async function clearDonorAddress(params: {
  donorId: string;
  churchId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}) {
  const donor = await prisma.donor.findFirst({ where: { id: params.donorId, churchId: params.churchId } });
  if (!donor) throw new Error("Donor not found");

  const previous: AddressInput = {
    addressLine1: donor.addressLine1,
    addressLine2: donor.addressLine2,
    city: donor.city,
    state: donor.state,
    postalCode: donor.postalCode,
    country: donor.country,
  };

  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: {
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      addressSource: null,
      addressVerified: "UNVERIFIED",
      lastAddressConfirmedAt: null,
      addressUpdatedAt: new Date(),
      addressUpdatedByUserId: params.actorUserId ?? null,
    },
  });

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId ?? null,
    actorEmail: params.actorEmail ?? null,
    actorRole: params.actorRole ?? null,
    action: "donor.address_cleared",
    entityType: "donor",
    entityId: donor.id,
    metadata: { previousAddress: toAuditValue(previous) },
    req: params.req,
  });

  return updated;
}

/** Marks the donor's current address confirmed — by the donor or by an authorized organization user. Never inferred from format validation passing. */
export async function confirmDonorAddress(params: {
  donorId: string;
  churchId: string;
  confirmedAs: "CONFIRMED_BY_DONOR" | "CONFIRMED_BY_ORG";
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}) {
  const donor = await prisma.donor.findFirst({ where: { id: params.donorId, churchId: params.churchId } });
  if (!donor) throw new Error("Donor not found");
  if (!donor.addressLine1) throw new Error("This donor has no address on file to confirm");

  const now = new Date();
  const updated = await prisma.donor.update({
    where: { id: donor.id },
    data: { addressVerified: params.confirmedAs, lastAddressConfirmedAt: now },
  });

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId ?? null,
    actorEmail: params.actorEmail ?? null,
    actorRole: params.actorRole ?? null,
    action: "donor.address_confirmed",
    entityType: "donor",
    entityId: donor.id,
    metadata: { confirmedAs: params.confirmedAs },
    req: params.req,
  });

  return updated;
}

/** Address-completeness/status label for donor-list and annual-statement "ready to mail" indicators — never the full street address, just a status. */
export function computeAddressStatus(donor: { addressLine1: string | null; addressVerified: string | null }): "MISSING" | "UNVERIFIED" | "CONFIRMED" {
  if (!donor.addressLine1) return "MISSING";
  if (donor.addressVerified === "CONFIRMED_BY_DONOR" || donor.addressVerified === "CONFIRMED_BY_ORG") return "CONFIRMED";
  return "UNVERIFIED";
}
