import { formatCents } from "@/lib/format";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import type { DonorReportColumn, DonorReportRow } from "./types";

/** Readable labels for export headers — never raw field names (item 16). */
export const DONOR_COLUMN_LABELS: Record<DonorReportColumn, string> = {
  donorName: "Donor Name",
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  phone: "Phone",
  companyName: "Company/Organization",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "ZIP",
  firstDonationDate: "First Donation Date",
  lastDonationDate: "Most Recent Donation Date",
  donationCount: "Number of Donations",
  averageDonationCents: "Average Donation",
  largestDonationCents: "Largest Donation",
  smallestDonationCents: "Smallest Donation",
  ytdGivingCents: "YTD Giving",
  previousYearGivingCents: "Previous Year Giving",
  periodGivingCents: "Selected Period Giving",
  lifetimeGivingCents: "Lifetime Giving",
  cardGivingCents: "Card Giving",
  achGivingCents: "ACH Giving",
  externalGivingCents: "External Giving",
  cashGivingCents: "Cash Giving",
  checkGivingCents: "Check Giving",
  inKindValueCents: "In-Kind Value",
  refundedAmountCents: "Refunded Amount",
  returnedAmountCents: "Returned Amount",
  isRecurringDonor: "Recurring Donor",
  recurringAmountCents: "Recurring Amount",
  givingFrequency: "Giving Frequency",
  givingPage: "Giving Page",
  fund: "Fund",
  purpose: "Purpose/Designation",
  attributedUserName: "Assigned Fundraiser",
};

const CENTS_COLUMNS = new Set<DonorReportColumn>([
  "averageDonationCents",
  "largestDonationCents",
  "smallestDonationCents",
  "ytdGivingCents",
  "previousYearGivingCents",
  "periodGivingCents",
  "lifetimeGivingCents",
  "cardGivingCents",
  "achGivingCents",
  "externalGivingCents",
  "cashGivingCents",
  "checkGivingCents",
  "inKindValueCents",
  "refundedAmountCents",
  "returnedAmountCents",
  "recurringAmountCents",
]);
const DATE_COLUMNS = new Set<DonorReportColumn>(["firstDonationDate", "lastDonationDate"]);
const BOOL_COLUMNS = new Set<DonorReportColumn>(["isRecurringDonor"]);

export function formatDonorColumnValue(row: DonorReportRow, column: DonorReportColumn): string {
  const value = row[column];
  if (value === null || value === undefined) return "";
  if (CENTS_COLUMNS.has(column)) return formatCents(value as number);
  if (DATE_COLUMNS.has(column)) return formatCalendarDateUTC(value as Date);
  if (BOOL_COLUMNS.has(column)) return value ? "Yes" : "No";
  return String(value);
}

/** Raw numeric/date value for Excel cells (proper cell types, not pre-formatted strings) — see exportExcel.ts. */
export function rawDonorColumnValue(row: DonorReportRow, column: DonorReportColumn): string | number | boolean | Date | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (CENTS_COLUMNS.has(column)) return (value as number) / 100;
  return value as string | number | boolean | Date;
}

export function isDonorColumnCurrency(column: DonorReportColumn): boolean {
  return CENTS_COLUMNS.has(column);
}
export function isDonorColumnDate(column: DonorReportColumn): boolean {
  return DATE_COLUMNS.has(column);
}
