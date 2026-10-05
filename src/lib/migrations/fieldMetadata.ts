/**
 * Client-safe field metadata for the mapping-step dropdowns only — no
 * validation logic lives here. DONATION_HISTORY's real field keys/labels
 * live in externalDonationImport.ts, but that module pulls in Node's
 * `crypto` for fingerprinting and can't be imported from a "use client"
 * component, so its label list is mirrored here for display purposes.
 * Keep in sync with IMPORT_FIELD_KEYS/IMPORT_FIELD_LABELS there.
 */
import type { MigrationEntityType } from "@/lib/migrations/types";
import { DONOR_IMPORT_FIELD_LABELS } from "@/lib/migrations/donorImportMapping";
import { FUND_IMPORT_FIELD_LABELS } from "@/lib/migrations/fundImport";

const DONATION_HISTORY_FIELD_LABELS: Record<string, string> = {
  donorFirstName: "Donor First Name",
  donorLastName: "Donor Last Name",
  donorEmail: "Donor Email",
  donorPhone: "Donor Phone",
  donorAddress: "Donor Address",
  amount: "Amount",
  donationDate: "Donation Date",
  paymentMethod: "Payment Method",
  fund: "Fund",
  campaign: "Campaign",
  referenceNumber: "Reference Number",
  taxDeductible: "Tax Deductible",
  deductibleAmount: "Deductible Amount",
  goodsOrServicesProvided: "Goods or Services Provided",
  goodsOrServicesValue: "Goods or Services Value",
  anonymous: "Anonymous",
  notes: "Notes",
  sendReceipt: "Send Receipt",
};

export function fieldOptionsFor(entityType: MigrationEntityType): { key: string; label: string }[] {
  const labels = entityType === "DONOR" ? DONOR_IMPORT_FIELD_LABELS : entityType === "FUND" ? FUND_IMPORT_FIELD_LABELS : DONATION_HISTORY_FIELD_LABELS;
  return Object.entries(labels).map(([key, label]) => ({ key, label }));
}
