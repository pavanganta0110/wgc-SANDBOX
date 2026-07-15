export const DONOR_COLUMNS = [
  { key: "donor", label: "Donor" },
  { key: "contact", label: "Contact" },
  { key: "status", label: "Status" },
  { key: "totalDonated", label: "Total Donated" },
  { key: "donationCount", label: "Donation Count" },
  { key: "averageDonation", label: "Average Donation" },
  { key: "firstDonation", label: "First Donation" },
  { key: "lastDonation", label: "Last Donation" },
  { key: "recurringStatus", label: "Recurring Status" },
  { key: "paymentMethods", label: "Payment Methods" },
  { key: "failedPayments", label: "Failed Payments" },
  { key: "refunds", label: "Refunds" },
  { key: "bankReturns", label: "Bank Returns" },
  { key: "disputes", label: "Disputes" },
  { key: "created", label: "Created" },
] as const;

export type DonorColumnKey = (typeof DONOR_COLUMNS)[number]["key"];

export function parseVisibleDonorColumns(colsParam: string | undefined): Set<DonorColumnKey> {
  if (!colsParam) return new Set(DONOR_COLUMNS.map((c) => c.key));
  const requested = new Set(colsParam.split(","));
  return new Set(DONOR_COLUMNS.map((c) => c.key).filter((k) => requested.has(k)));
}
